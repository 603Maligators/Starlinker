import logging
import click

from ..runtime import create_runtime
from ..admin_api import create_app


@click.group()
def main() -> None:
    pass


@main.command()
@click.option("--module-dir", default="examples", type=click.Path(exists=True))
@click.option("-v", "--verbose", is_flag=True)
@click.option("--port", default=8765, type=int)
def start(module_dir: str, verbose: bool, port: int) -> None:
    """Start runtime and admin API."""
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO)
    rt = create_runtime(module_dir)
    rt.start()
    app = create_app(rt)
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
