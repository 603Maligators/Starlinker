from forgecore.capabilities import CapabilityRegistry


class Prov:
    def __init__(self, v):
        self.v = v


def test_resolution_semver():
    reg = CapabilityRegistry()
    p1 = Prov("1.0.0")
    p2 = Prov("1.5.0")
    p3 = Prov("2.0.0")
    reg.bind("svc@1.0.0", p1)
    reg.bind("svc@1.5.0", p2)
    reg.bind("svc@2.0.0", p3)

    assert reg.get("svc@1.0.0") is p1
    assert reg.get("svc@^1.0") is p2
    assert reg.get("svc@^2.0") is p3
    assert reg.get("svc@<1.4") is p1
    assert reg.get("svc@>=1.0,<2.0") is p2
