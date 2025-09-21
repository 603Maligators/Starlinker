from forgecore.starlinker_news.config import StarlinkerConfig
from forgecore.starlinker_news.store import SettingsRepository, StarlinkerDatabase


def test_settings_repository_initialises_defaults(tmp_path):
    db = StarlinkerDatabase(tmp_path / "starlinker.db")
    repo = SettingsRepository(db)
    config = repo.load()

    assert isinstance(config, StarlinkerConfig)
    assert config.outputs.discord_webhook == ""
    assert repo.export_raw()[SettingsRepository.SETTINGS_KEY]["timezone"] == "America/New_York"


def test_settings_repository_saves_and_reloads(tmp_path):
    db = StarlinkerDatabase(tmp_path / "starlinker.db")
    repo = SettingsRepository(db)
    config = repo.load()
    config.outputs.discord_webhook = "https://hooks.example"
    repo.save(config)

    reloaded = repo.load()
    assert reloaded.outputs.discord_webhook == "https://hooks.example"
    assert repo.missing_prerequisites(reloaded) == []
