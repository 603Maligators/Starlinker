from forgecore.event_bus import EventBus


def test_publish_subscribe_isolation():
    bus = EventBus()
    called = []

    def bad(payload):
        raise RuntimeError("boom")

    def good(payload):
        called.append(payload)

    bus.subscribe("t", bad)
    bus.subscribe("t", good)

    bus.publish("t", 1)
    assert called == [1]
