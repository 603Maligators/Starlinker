from setuptools import setup, find_packages

setup(
    name="forgecore-runtime",
    version="0.1.0",
    packages=find_packages(),
    install_requires=["packaging>=21.0", "click>=8.0.0"],
    extras_require={
        "watch": ["watchdog>=2.0.0"],
        "dev": ["pytest>=7.0.0", "fastapi>=0.68.0", "uvicorn>=0.15.0"],
    },
    entry_points={"console_scripts": ["forge=forgecore.cli.forge:main"]},
)
