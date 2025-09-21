class Module:
    def on_load(self, ctx):
        self.ctx = ctx
        self._unsub = ctx.event_bus.subscribe("greet", self.handle)
        ctx.logger.info("basic_module loaded")

    def handle(self, payload):
        self.ctx.logger.info("greeted %s", payload)

    def on_enable(self):
        self.ctx.event_bus.publish("greet", "world")

    def on_disable(self):
        self._unsub()
