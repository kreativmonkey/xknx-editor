"""Parsing application XMLs into the parse cache, in this process or in worker processes."""

from __future__ import annotations

import hashlib
import io
import pickle
from concurrent.futures import Future
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import psutil
import pytest

from xknxeditor.namespaces import detect_version
from xknxeditor.prod import parse_cache
from xknxeditor.prod.archive import ArchiveMember
from xknxeditor.prod.data import to_ir

_FIXTURES = Path(__file__).parent / "fixtures"
_APPLICATIONS = [
    _FIXTURES / "calculations_application.xml",
    _FIXTURES / "download_invisible_application.xml",
    _FIXTURES / "inactive_choose_application.xml",
]
_MB = 1_000_000


@pytest.fixture
def machine(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A machine with 8 physical cores and 32 GiB of free memory."""
    monkeypatch.setattr(psutil, "cpu_count", lambda logical=True: 8)
    monkeypatch.setattr(
        psutil.Process, "cpu_affinity", lambda _self: list(range(8)), raising=False
    )
    monkeypatch.setattr("xknxeditor.prod.resources._PROC_SELF", tmp_path)

    class _Memory:
        available = 32 << 30

    monkeypatch.setattr(psutil, "virtual_memory", lambda: _Memory())


@pytest.mark.usefixtures("machine")
@pytest.mark.parametrize(
    ("sizes", "workers"),
    [
        ([1 * _MB] * 9, 1),  # a few MB: starting workers costs more than it saves
        ([_MB // 2] * 30, 1),
        ([80 * _MB], 1),  # one application cannot be split
        ([80 * _MB, 1 * _MB], 1),  # the largest one takes its time either way
        ([2 * _MB] * 10, 3),  # one worker per 8 MB
        ([5 * _MB] * 10, 7),  # at most one per physical core but one
        ([80 * _MB] + [1 * _MB] * 20, 2),  # no more than finish beside the largest one
        ([14 * _MB] * 59, 7),
    ],
)
def test_parse_workers(sizes: list[int], workers: int) -> None:
    assert parse_cache.parse_workers(sizes) == workers


def test_parse_workers_within_free_memory(
    machine: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    class _Memory:
        available = 3 << 30

    monkeypatch.setattr(psutil, "virtual_memory", lambda: _Memory())
    assert parse_cache.parse_workers([14 * _MB] * 59) == 3


@pytest.mark.usefixtures("machine")
def test_parse_workers_within_container_memory(tmp_path: Path) -> None:
    cgroup = tmp_path / "cgroup fs"
    container = cgroup / "container"
    container.mkdir(parents=True)
    (tmp_path / "cgroup").write_text("0::/container\n")
    encoded_mount = cgroup.as_posix().replace(" ", r"\040")
    (tmp_path / "mountinfo").write_text(
        f"1 0 0:1 / {encoded_mount} rw - cgroup2 cgroup rw\n"
    )
    (container / "memory.max").write_text(str(2 << 30))
    sizes = [25 * _MB] * 10

    (container / "memory.current").write_text(str(512 << 20))
    assert parse_cache.parse_workers(sizes) == 1
    assert parse_cache.worker_processes(sizes) == 1

    (container / "memory.current").write_text(str(1536 << 20))
    assert parse_cache.worker_processes(sizes) == 0

    (container / "memory.stat").write_text(f"inactive_file {1024 << 20}\n")
    assert parse_cache.worker_processes(sizes) == 1


def _one_per_application(sizes: list[int]) -> int:
    return len(sizes)


def _xmls() -> list[bytes]:
    return [path.read_bytes() for path in _APPLICATIONS]


def _sources(
    xmls: list[bytes], path: Path, *, nested: bool = False
) -> list[ArchiveMember]:
    buffer = io.BytesIO()
    containers = ("inner.zip",) if nested else ()
    with ZipFile(buffer if nested else path, "w", ZIP_DEFLATED) as archive:
        for index, xml in enumerate(xmls):
            archive.writestr(f"{index}.xml", xml)
        sources = [
            ArchiveMember(path, entry.filename, entry.file_size, entry.CRC, containers)
            for entry in archive.infolist()
        ]
    if nested:
        with ZipFile(path, "w", ZIP_DEFLATED) as archive:
            archive.writestr("inner.zip", buffer.getvalue())
    return sources


def _expected_path(xml: bytes, cache_dir: Path) -> Path:
    digest = hashlib.sha256(xml).hexdigest()
    return (
        cache_dir / f"ir_{parse_cache.CACHE_VERSION}_{detect_version(xml)}_{digest}.pkl"
    )


@pytest.mark.parametrize("nested", [False, True])
def test_workers_parse_into_the_cache(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, nested: bool
) -> None:
    monkeypatch.setattr(parse_cache, "parse_workers", _one_per_application)
    xmls = _xmls()
    sources = _sources(xmls, tmp_path / "products.zip", nested=nested)
    parallel = tmp_path / "parallel"
    keys = parse_cache.fill_cache(sources, parallel)

    for source, xml in zip(sources, xmls, strict=True):
        version = detect_version(xml)
        path = _expected_path(xml, parallel)
        assert keys[source].path(parallel) == path
        assert keys[source].size == len(xml)
        assert pickle.loads(path.read_bytes()) == to_ir(xml, version)


def test_small_applications_stay_in_this_process(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def no_pool(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("worker processes were started")

    monkeypatch.setattr(parse_cache, "ProcessPoolExecutor", no_pool)
    sources = _sources(_xmls(), tmp_path / "products.zip")
    sources[0].path.unlink()
    cache = tmp_path / "cache"
    assert parse_cache.fill_cache(sources, cache) == {}
    assert not cache.exists()


class _RecordingFuture(Future[parse_cache.CacheKey]):
    """A finished parse that tells when it is waited for."""

    def __init__(self, events: list[str], index: int) -> None:
        super().__init__()
        self._events = events
        self._index = index

    def result(self, timeout: float | None = None) -> parse_cache.CacheKey:
        self._events.append(f"wait {self._index}")
        assert self.done()
        return super().result(timeout)


class _RecordingPool:
    """A worker pool that records which XMLs it is handed and when they are waited for."""

    def __init__(self, events: list[str], sources: list[ArchiveMember]) -> None:
        self._events = events
        self._sources = sources
        self._futures: list[_RecordingFuture] = []

    def __call__(self, **_kwargs: object) -> _RecordingPool:
        return self

    def shutdown(self) -> None:
        pass

    def submit(
        self, _fn: object, source: ArchiveMember, _cache_dir: Path
    ) -> Future[parse_cache.CacheKey]:
        assert isinstance(source, ArchiveMember)
        assert pickle.loads(pickle.dumps(source)) == source
        index = self._sources.index(source)
        self._events.append(f"submit {index}")
        future = _RecordingFuture(self._events, index)
        self._futures.append(future)
        # The second worker finishes first. The first one stays busy until the pool feeds the
        # second one another XML.
        if index != 0:
            future.set_result(parse_cache.CacheKey("23", str(index), source.size))
        if index == 2:
            self._futures[0].set_result(
                parse_cache.CacheKey("23", "0", self._sources[0].size)
            )
        return future


def test_only_a_few_xmls_are_handed_over_at_once(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Only a member description is submitted, and each worker gets one at a time."""
    base = _xmls()[0]
    # Ten different applications of falling size (the largest are handed over first).
    xmls = [base + b"<!--" + b"x" * (10 - index) + b"-->" for index in range(10)]
    sources = _sources(xmls, tmp_path / "products.zip")
    sources[0].path.unlink()  # neither the parent nor the fake workers can read XML
    events: list[str] = []
    monkeypatch.setattr(
        parse_cache, "ProcessPoolExecutor", _RecordingPool(events, sources)
    )
    monkeypatch.setattr(parse_cache, "parse_workers", lambda _sizes: 2)
    progress: list[tuple[int, int]] = []

    parse_cache.fill_cache(
        sources,
        tmp_path,
        progress=lambda done, total: progress.append((done, total)),
    )

    assert events[:4] == [
        "submit 0",
        "submit 1",
        "wait 1",
        "submit 2",
    ]
    assert [event for event in events if event.startswith("submit")] == [
        f"submit {index}" for index in range(10)
    ]
    pending = 0
    for event in events:
        if event.startswith("wait"):
            pending -= 1
        elif event.startswith("submit"):
            pending += 1
        assert 0 <= pending <= 2
    assert pending == 0
    assert progress == [(done, 10) for done in range(1, 11)]


@pytest.mark.parametrize("old", ["0", "3"])
def test_entries_of_other_cache_versions_are_removed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, old: str
) -> None:
    """A parse written by another cache version (another conversion, or 3: pickled as pickle
    does) is never read again: the next parse into the folder removes it, and the parse is made
    anew."""
    monkeypatch.setattr(parse_cache, "_SWEPT", set())
    xml = _xmls()[0]
    version = detect_version(xml)
    stale = _expected_path(xml, tmp_path).name.replace(
        f"ir_{parse_cache.CACHE_VERSION}_", f"ir_{old}_"
    )
    assert stale != _expected_path(xml, tmp_path).name
    (tmp_path / stale).write_bytes(
        pickle.dumps(to_ir(xml, version)) if old == "3" else b"old conversion"
    )
    other = tmp_path / "unrelated.txt"
    other.write_text("kept")

    knx = parse_cache.cached_to_ir(xml, version, tmp_path)

    assert knx.manufacturer_data is not None
    assert not (tmp_path / stale).exists()
    assert other.exists()
    assert pickle.loads(_expected_path(xml, tmp_path).read_bytes()) == knx


def test_a_cache_entry_is_the_pickled_parse(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The entry written is a pickle of the parse, and it is read back without parsing."""
    xml = _xmls()[0]
    version = detect_version(xml)
    knx = parse_cache.cached_to_ir(xml, version, tmp_path)
    assert pickle.loads(_expected_path(xml, tmp_path).read_bytes()) == knx
    assert not list(tmp_path.glob("*.tmp"))

    def no_parse(*_args: object) -> None:
        raise AssertionError("parsed again")

    monkeypatch.setattr(parse_cache, "to_ir", no_parse)
    assert parse_cache.cached_to_ir(xml, version, tmp_path) == knx


@pytest.mark.usefixtures("machine")
@pytest.mark.parametrize(
    ("sizes", "processes"),
    [
        ([1 * _MB] * 9, 0),  # parsed in this process
        ([19 * _MB], 0),
        ([20 * _MB], 1),  # a large application alone: one worker
        ([80 * _MB, 1 * _MB], 1),
        ([2 * _MB] * 10, 3),  # as many as parse_workers
        ([], 0),
    ],
)
def test_worker_processes(sizes: list[int], processes: int) -> None:
    assert parse_cache.worker_processes(sizes) == processes


def test_no_lone_worker_without_the_memory_for_it(
    machine: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    class _Memory:
        available = 512 << 20

    monkeypatch.setattr(psutil, "virtual_memory", lambda: _Memory())
    assert parse_cache.worker_processes([80 * _MB]) == 0


def test_workers_count_the_bytes_they_parse(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(parse_cache, "parse_workers", _one_per_application)
    xmls = _xmls()
    heard: list[int] = []
    sources = _sources(xmls, tmp_path / "products.zip")
    parse_cache.fill_cache(sources, tmp_path, parsed_bytes=heard.append)
    assert heard[-1] == sum(len(xml) for xml in xmls)
    assert heard == sorted(heard)


def test_a_cached_application_counts_as_parsed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(parse_cache, "parse_workers", _one_per_application)
    xmls = _xmls()
    parse_cache.cached_to_ir(xmls[0], detect_version(xmls[0]), tmp_path)
    original = _expected_path(xmls[0], tmp_path).stat().st_mtime_ns
    heard: list[int] = []
    sources = _sources(xmls, tmp_path / "products.zip")
    keys = parse_cache.fill_cache(sources, tmp_path, parsed_bytes=heard.append)
    assert keys[sources[0]].path(tmp_path).stat().st_mtime_ns == original
    assert heard[-1] == sum(len(xml) for xml in xmls)
    assert heard == sorted(heard)


def test_a_parse_tells_how_far_it_has_got(tmp_path: Path) -> None:
    """Reading the XML counts for READ_SHARE of its bytes, converting it up to CONVERTED_SHARE,
    storing it the rest; a parse read back from the cache is done at once."""
    from xknxeditor.namespaces import parse_progress

    xml = _xmls()[0]
    size = len(xml)
    heard: list[int] = []
    with parse_progress(heard.append):
        parse_cache.cached_parse(xml, detect_version(xml), tmp_path)
    assert heard[-2:] == [int(size * parse_cache.CONVERTED_SHARE), size]
    assert all(0 < position <= size * parse_cache.READ_SHARE for position in heard[:-2])
    assert heard == sorted(heard)

    heard.clear()
    with parse_progress(heard.append):
        parse_cache.cached_parse(xml, detect_version(xml), tmp_path)
    assert heard == [size]
