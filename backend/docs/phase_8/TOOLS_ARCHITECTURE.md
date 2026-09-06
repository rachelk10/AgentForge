# Stage 8: Tools

Tools are persisted as metadata in `tools` and associated with agents through
`agent_tools`. The runtime executes only a registered `execution_logic` handler;
it does not know the implementation of that handler.

## Handler registration

```python
from app.runtime.tools import tool_registry

tool_registry.register("weather.lookup", weather_handler)
```

The handler receives a dictionary and may return a value or an awaitable. Input
and output JSON schemas are validated, execution is bounded by a timeout, and
all failures are returned as `ToolResult(success=False, error=...)`.

## API

- `POST /api/v1/tools` register
- `GET /api/v1/tools` list
- `GET /api/v1/tools/{tool_id}` get
- `PATCH /api/v1/tools/{tool_id}` update
- `PUT /api/v1/tools/{tool_id}/agents/{agent_id}` enable
- `DELETE /api/v1/tools/{tool_id}/agents/{agent_id}` disable
- `DELETE /api/v1/tools/{tool_id}/agents/{agent_id}/remove` remove
- `POST /api/v1/tools/{tool_id}/agents/{agent_id}/execute` execute

All endpoints require an authenticated user and enforce ownership of both the
Tool and Agent. The process logger records tool ID and execution duration.