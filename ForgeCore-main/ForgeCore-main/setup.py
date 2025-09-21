from setuptools import setup, find_packages

setup(
    name="forgecore-runtime",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "packaging>=21.0",
        "click>=8.0.0",
        "watchdog>=2.0.0",
        "fastapi>=0.95.0",
        "uvicorn>=0.21.0",
        "pydantic>=1.10.0",
        "httpx>=0.24.1",
    ],
    extras_require={
        "dev": ["pytest>=7.0.0"],
    },
    entry_points={
        "console_scripts": [
            "forge=forgecore.cli.forge:main",
            "starlinker-backend=forgecore.starlinker_news.__main__:main",
        ]
    },
)
