# ForgeCore Agent Guide

## Overview

ForgeCore is a lightweight, modular runtime system for building hot-pluggable desktop applications in Python. It provides Docker-like ergonomics for in-process plugin architectures with explicit contracts, deterministic dependency resolution, and zero web dependencies.

## Core Architecture

### Main Components
1. **ForgeRuntime** - Central orchestrator that manages all subsystems
2. **ModuleLoader** - Handles module discovery, loading, and lifecycle management
3. **EventBus** - Thread-safe pub/sub messaging system for module communication
4. **CapabilityRegistry** - Manages semantic versioning and dependency resolution
5. **StorageManager** - Provides persistent data storage for modules
6. **LifecycleManager** - Orchestrates module lifecycle hooks

### Key Concepts
- **Module**: A folder containing `module.json` manifest and Python code
- **Capability**: A versioned interface contract (e.g., `core.storage@1.0`)
- **Manifest**: JSON file declaring module metadata, dependencies, and capabilities
- **Hot-plugging**: Add/remove modules at runtime without restart
- **Nested Modules**: Hierarchical organization with scoped registries

## Module Structure
### Required Files
```
my_module/
├── module.json
├── __init__.py
└── README.md
```

### Manifest Schema (module.json)
```json
{
  "name": "module_name",
  "version": "1.0.0",
  "description": "Module purpose",
  "author": "Developer Name",
  "main": "__init__.py",
  "depends": [],
  "capabilities": [
    {
      "name": "service.name",
      "version": "1.0.0",
      "description": "Service description"
    }
  ],
  "requires_capabilities": ["other.service>=1.0.0"],
  "tags": ["category","type"],
  "config_schema": {},
  "migrations": [],
  "hot_reload": true,
  "auto_enable": true
}
```

### Module Code Example (__init__.py)
```python
import logging
from forgecore import get_runtime

def on_load():
    runtime = get_runtime()
    config = runtime.storage.load("module_name","config",{
        "default_setting":"value"
    })
    runtime.event_bus.subscribe("some.event", handle_event)
    runtime.event_bus.emit("module_name.loaded", {"status":"loaded"})

def on_enable(): pass
def on_disable(): pass
def on_unload(): pass

def handle_event(event_data): print(event_data)
```

## (Document continues with Lifecycle, CLI, EventBus, Storage, Hot-plug workflow, Best practices, etc.)
