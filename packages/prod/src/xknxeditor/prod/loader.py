"""Load a .knxprod and index every per-file parse into a `Registry`.

Each file type has its own `parse_*_xml`; the loader reads each XML once and populates the
registry's stores and relationship maps. Cross-file links stay as edges (`program_to_application`)
rather than being baked onto objects, so the registry resolves them.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import ExitStack
from functools import partial
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TYPE_CHECKING

from xknxeditor.namespaces import parse_progress

from . import parse_cache
from .application import Application, cached_applications, parse_application_xml
from .archive import Archive, ArchiveMember
from .catalog import parse_catalog_xml
from .errors import check_cancelled
from .hardware import parse_hardware_xml
from .master import parse_master_xml
from .registry import ApplicationFacts, Registry

if TYPE_CHECKING:
    import threading
    from zipfile import ZipInfo

    from xknxeditor.namespaces.intermediate.application_program_t import (
        ApplicationProgram,
    )

    from .parse_cache import CacheKey

logger = logging.getLogger(__name__)


class _ParsedShare:
    """Tells ``report`` the share (0 to 1) of ``total`` bytes of application XML parsed so far,
    never less than before."""

    def __init__(self, report: Callable[[float], None] | None, total: int) -> None:
        self._report = report
        self._total = total
        self._shown = 0.0

    def __call__(self, parsed: int) -> None:
        if self._report is None or not self._total:
            return
        share = min(1.0, parsed / self._total)
        if share > self._shown:
            self._shown = share
            self._report(share)


def _shifted(share: _ParsedShare, before: int, position: int) -> None:
    """Report ``position`` bytes into an application XML that follows ``before`` bytes."""
    share(before + position)


def _read_applications(
    archive: Archive,
    manufacturer_id: str,
    xml_id: str,
    cache_dir: Path | None,
) -> list[Application]:
    return parse_application_xml(
        archive.read_application_xml(manufacturer_id, xml_id),
        manufacturer_id,
        cache_dir=cache_dir,
    )


def _reload_program(
    source: str | bytes | Path,
    require_catalog: bool,
    manufacturer_id: str,
    xml_id: str,
    cache_dir: Path | None,
    key: CacheKey | None,
    application_id: str,
) -> ApplicationProgram:
    """The parsed program ``application_id`` of the application XML ``xml_id`` in ``source``,
    from the parse cache in ``cache_dir`` (parsed again when it is not there)."""
    applications = (
        cached_applications(key, manufacturer_id, cache_dir=cache_dir)
        if key is not None
        else None
    )
    if applications is None:
        with Archive(source, require_catalog=require_catalog) as archive:
            applications = _read_applications(
                archive, manufacturer_id, xml_id, cache_dir
            )
    for application in applications:
        if application.id == application_id:
            return application.program
    raise LookupError(f"{xml_id} no longer holds the application {application_id}")


def _add_applications(
    registry: Registry,
    archive: Archive,
    manufacturer_id: str,
    xml_id: str,
    cache_dir: Path | None,
    key: CacheKey | None,
    reload: Callable[[str], ApplicationProgram],
) -> None:
    """Add the application programs of one application XML and their facts to ``registry``.

    With ``cache_dir`` they are added without their parsed programs: ``reload`` reads one again
    (by its id) when it is used."""
    applications = (
        cached_applications(key, manufacturer_id, cache_dir=cache_dir)
        if key is not None
        else None
    )
    if applications is None:
        applications = _read_applications(archive, manufacturer_id, xml_id, cache_dir)
    for application in applications:
        program = application.program
        registry.application_facts[application.id] = ApplicationFacts(
            application_number=program.application_number,
            application_version=program.application_version,
            mask_version=program.mask_version,
            is_secure_enabled=bool(program.is_secure_enabled),
        )
        if cache_dir is not None:
            application = Application.unloaded(
                application.id,
                application.name,
                application.version,
                manufacturer_id,
                partial(reload, application.id),
            )
        registry.applications[application.id] = application


def _warm_cache(
    source: str | bytes | Path,
    entries: dict[tuple[str, str], ZipInfo],
    cache_dir: Path,
    *,
    cancel: threading.Event | None,
    progress: Callable[[int, int], None] | None,
    parsed_bytes: Callable[[int], None] | None,
) -> dict[tuple[str, str], CacheKey]:
    """Let workers read archive members and return their cache keys."""

    def warm(
        path: Path, staged: ExitStack | None = None
    ) -> dict[tuple[str, str], CacheKey]:
        members = {
            app: ArchiveMember(path, entry.filename, entry.file_size, entry.CRC)
            for app, entry in entries.items()
        }
        keys = parse_cache.fill_cache(
            list(members.values()),
            cache_dir,
            cancel=cancel,
            progress=progress,
            parsed_bytes=parsed_bytes,
            cleanup=staged.pop_all().close if staged is not None else None,
        )
        return {app: keys[member] for app, member in members.items() if member in keys}

    if not isinstance(source, bytes):
        return warm(Path(source).absolute())
    if not parse_cache.worker_processes(
        [entry.file_size for entry in entries.values()]
    ):
        return {}
    check_cancelled(cancel)
    # Catalog imports (including projects and converted product sources) provide ZIP bytes.
    # Stage the compressed archive once so the pool can reopen it as a file.
    with ExitStack() as stack:
        try:
            folder = stack.enter_context(TemporaryDirectory())
            path = Path(folder) / "products.zip"
            path.write_bytes(source)
        except OSError as exc:
            logger.warning(
                "could not stage product archive for parallel parsing: %s", exc
            )
            return {}
        return warm(path, stack)


def load(
    source: str | bytes | Path,
    *,
    require_catalog: bool = True,
    cache_dir: Path | None = None,
    cancel: threading.Event | None = None,
    progress: Callable[[int, int], None] | None = None,
    parsed_share: Callable[[float], None] | None = None,
) -> Registry:
    """Load a .knxprod (path or bytes) into one queryable `Registry`; ids are globally unique.

    ``require_catalog`` passes through to :class:`Archive`: set it ``False`` to ingest the product
    data embedded in a ``.knxproj`` (which omits ``Catalog.xml``); the catalog section/item index is
    then simply absent for manufacturers without a ``Catalog.xml``, hardware/applications still load.
    ``cache_dir`` stores each application's parse in the parse cache (see :mod:`parse_cache`), so
    loading the application later does not parse it again. With it, the applications are parsed in
    parallel worker processes (see :func:`parse_cache.fill_cache`), and the registry's
    applications do not keep their parsed programs: each is read again from the cache when it is
    used, so a product with many large applications never holds more than one of them at a time.
    Without it, every application keeps its parsed program. Setting ``cancel`` stops the
    load between applications with :class:`~.errors.ImportCancelled`. ``progress`` hears how many
    of the archive's application programs are parsed, out of how many, after each one;
    ``parsed_share`` the share (0 to 1) of their XML parsed, while it is parsed.
    """
    with Archive(source, require_catalog=require_catalog) as archive:
        registry = Registry(master=parse_master_xml(archive.get_master_xml()))
        application_ids = {
            m: archive.application_ids(m) for m in archive.manufacturer_ids
        }
        total = sum(len(ids) for ids in application_ids.values())
        parsed = 0
        entries = {
            (manufacturer_id, app_id): archive.application_xml_info(
                manufacturer_id, app_id
            )
            for manufacturer_id, ids in sorted(application_ids.items())
            for app_id in ids
        }
        share = _ParsedShare(
            parsed_share, sum(entry.file_size for entry in entries.values())
        )
        keys = (
            _warm_cache(
                source,
                entries,
                cache_dir,
                cancel=cancel,
                progress=progress,
                parsed_bytes=share if parsed_share is not None else None,
            )
            if cache_dir is not None
            else {}
        )
        # The bytes of the applications added so far.
        added = 0

        for manufacturer_id in sorted(archive.manufacturer_ids):
            # A manufacturer without Hardware.xml only contributes application programs.
            hardware_count = program_count = 0
            if archive.has_hardware(manufacturer_id):
                doc = parse_hardware_xml(archive.get_hardware_xml(manufacturer_id))
                registry.hardware.update(doc.hardware)
                registry.products.update(doc.products)
                registry.programs.update(doc.programs)
                registry.hardware_to_product.update(doc.hardware_to_product)
                registry.hardware_to_program.update(doc.hardware_to_program)
                registry.manufacturer_to_hardware[manufacturer_id] = list(doc.hardware)
                hardware_count, program_count = len(doc.hardware), len(doc.programs)
            else:
                registry.manufacturer_to_hardware[manufacturer_id] = []

            apps_before = len(registry.applications)
            # One application XML at a time: read, parse, keep what is needed, drop the rest
            # before the next one.
            for app_id in application_ids[manufacturer_id]:
                check_cancelled(cancel)
                key = keys.get((manufacturer_id, app_id))
                with parse_progress(partial(_shifted, share, added)):
                    _add_applications(
                        registry,
                        archive,
                        manufacturer_id,
                        app_id,
                        cache_dir,
                        key,
                        partial(
                            _reload_program,
                            source,
                            require_catalog,
                            manufacturer_id,
                            app_id,
                            cache_dir,
                            key,
                        ),
                    )
                added += entries[manufacturer_id, app_id].file_size
                share(added)
                parsed += 1
                if progress is not None:
                    progress(parsed, total)

            has_catalog = archive.has_catalog(manufacturer_id)
            if has_catalog:
                cat = parse_catalog_xml(archive.get_catalog_xml(manufacturer_id))
                registry.catalog_sections.update(cat.sections)
                registry.catalog_items.update(cat.items)
                registry.section_to_subsection.update(cat.section_to_subsection)
                registry.section_to_item.update(cat.section_to_item)
                registry.manufacturer_to_section[manufacturer_id] = list(cat.sections)
            logger.debug(
                "loaded manufacturer %s: %d hardware, %d programs, %d applications, catalog=%s",
                manufacturer_id,
                hardware_count,
                program_count,
                len(registry.applications) - apps_before,
                "yes" if has_catalog else "absent (project-embedded)",
            )

        # add program to application edges after all apps are indexed
        for program_id, program in registry.programs.items():
            app_ids = [
                a for a in program.application_ref_ids if a in registry.applications
            ]
            if app_ids:
                registry.program_to_application[program_id] = app_ids

    logger.debug(
        "archive loaded: %d manufacturers, %d hardware, %d programs, %d applications, "
        "%d catalog items (require_catalog=%s)",
        len(archive.manufacturer_ids),
        len(registry.hardware),
        len(registry.programs),
        len(registry.applications),
        len(registry.catalog_items),
        require_catalog,
    )
    return registry
