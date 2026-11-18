from carelens_ml.canary import CanaryController


class Model:
    def __init__(self, version: str):
        self.version = version


class Manager:
    def __init__(self):
        self.stable = Model("stable-v1")
        self.canary = Model("candidate-v2")
        self.canary_traffic_percent = 0


def test_healthy_canary_advances_deterministically_to_full_traffic():
    manager = Manager()
    clock = [100.0]
    controller = CanaryController(
        manager, enabled=True, minimum_samples=5, stage_interval_seconds=0, clock=lambda: clock[0]
    )
    assert manager.canary_traffic_percent == 5

    for expected in (25, 50, 75, 100):
        for _ in range(5):
            controller.observe("candidate-v2", latency_ms=40, score=0.52, basic_score=0.50)
        assert manager.canary_traffic_percent == expected
        clock[0] += 1

    for _ in range(5):
        controller.observe("candidate-v2", latency_ms=40, score=0.52, basic_score=0.50)

    assert controller.history[-1]["action"] == "completed"
    assert controller.history[-1]["trafficPercent"] == 100
    assert controller.state["enabled"] is False


def test_unhealthy_canary_rolls_back_and_records_reason():
    manager = Manager()
    controller = CanaryController(
        manager, enabled=True, minimum_samples=1, stage_interval_seconds=0
    )

    controller.observe("candidate-v2", latency_ms=40, error=True)

    assert manager.canary_traffic_percent == 0
    assert controller.history[-1]["action"] == "rolled_back"
    assert controller.history[-1]["reason"] == "error_rate_exceeded"
    assert controller.state["enabled"] is False


def test_disabled_or_unrelated_observations_do_not_change_traffic():
    manager = Manager()
    controller = CanaryController(manager, enabled=False, minimum_samples=1, stage_interval_seconds=0)
    controller.observe("stable-v1", latency_ms=40, score=0.5, basic_score=0.5)

    assert manager.canary_traffic_percent == 0
    assert controller.history == []
