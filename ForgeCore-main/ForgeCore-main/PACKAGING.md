# Packaging ForgeCore

ForgeCore is distributed as a standard Python package. This guide documents how
to build distributable artefacts, publish them to an internal index, and ship
Electron or containerised bundles.

## 1. Build a source distribution and wheel

Ensure your virtual environment is activated and tools are up to date:

```
pip install --upgrade build twine
python -m build
```

The command produces `dist/forgecore-<version>.tar.gz` and
`dist/forgecore-<version>-py3-none-any.whl`.

Validate the distribution metadata locally:

```
twine check dist/*
```

## 2. Publish to a package index

If you use PyPI-compatible infrastructure (e.g. Nexus, Artifactory), upload the
artefacts with Twine:

```
twine upload --repository-url https://pypi.example.com/simple dist/*
```

For TestPyPI:

```
twine upload --repository testpypi dist/*
```

Consumers can then install ForgeCore with:

```
pip install --index-url https://pypi.example.com/simple forgecore
```

## 3. Versioning and changelog

Update `CHANGELOG.md` before tagging a release. Follow semantic versioning and
match the `version` declared in `setup.py` (or `pyproject.toml` if migrated).
Tag releases with `git tag vX.Y.Z` and push them to your remote repository.

## 4. Bundling the Electron shell

The optional `electron/` directory contains a lightweight shell that can embed
the ForgeCore admin API. To package it:

1. Install dependencies with `npm install` inside `electron/`.
2. Build the bundle with `npm run build`.
3. Copy the `dist/` artefacts next to your Python distribution or publish them
to your asset CDN.

## 5. Container images

For container-based deployment, create a `Dockerfile` similar to:

```
FROM python:3.11-slim
WORKDIR /opt/forgecore
COPY . .
RUN pip install --no-cache-dir .
CMD ["python", "-m", "forgecore.cli.forge", "start", "--module-dir", "forgecore/examples"]
```

Remember to mount a persistent volume for the SQLite database, or configure
ForgeCore to use an alternative storage backend.

## 6. Release checklist

* [ ] Update `CHANGELOG.md` with notable changes.
* [ ] Bump the package version.
* [ ] Run `pytest` to ensure the test suite passes.
* [ ] Build artefacts with `python -m build`.
* [ ] Upload artefacts to the desired repository.
* [ ] Create/update release notes in your source-control platform.

Following these steps keeps ForgeCore releases reproducible and traceable.
