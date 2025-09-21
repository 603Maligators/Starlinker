class Module:
    def on_load(self, ctx):
        self.basic = ctx.registry.get("basic.service@^1.0")
        ctx.logger.info("rpg_inventory loaded")

    def on_enable(self):
        if self.basic:
            self.basic.ctx.logger.info("inventory ready")
