# API Testing

The project includes two levels of automated API checks:

- `pytest` runs fast in-process smoke tests.
- `Schemathesis` generates requests from the live OpenAPI schema and exercises all documented operations.

## Fast checks

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

## Full OpenAPI checks

Start the API and database first:

```powershell
docker compose up --build -d
```

Then run Schemathesis against the live service:

```powershell
.\scripts\run_api_tests.ps1
```

The runner creates a temporary test user, logs in, and passes the JWT to Schemathesis so protected endpoints are tested as an authenticated user. To use another API URL, set `$env:API_BASE_URL` before running it.

The generated requests include valid and invalid values based on the OpenAPI schema. Endpoints that require authentication will be checked for their documented unauthenticated behavior unless an authentication hook or token is supplied.

To stop the services:

```powershell
docker compose down
```
