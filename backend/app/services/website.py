import asyncio
import ipaddress
import socket
import ssl
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Iterable
from collections import deque
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpcore
import httpx
from fastapi import HTTPException, status
from httpcore._backends.auto import AutoBackend
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.rag.embeddings import EmbeddingProvider
from app.services.document import DocumentService

MAX_PAGES = 20
MAX_PAGE_BYTES = 1_000_000
MAX_REDIRECTS = 3
REQUEST_TIMEOUT_SECONDS = 8.0
CRAWL_TIMEOUT_SECONDS = 60.0
CRAWL_CONCURRENCY = 4
USER_AGENT = "AgentForgeWebsiteImporter/1.0"


class WebsiteFetchError(Exception):
    pass


@dataclass(frozen=True)
class FetchedPage:
    url: str
    title: str
    text: str
    links: list[str]


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self.links: list[str] = []
        self._in_title = False
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg", "template"}:
            self._ignored_depth += 1
        if tag == "title":
            self._in_title = True
        if tag == "a" and not self._ignored_depth:
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        if tag in {"script", "style", "noscript", "svg", "template"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        if self._in_title:
            self.title_parts.append(data)
            return
        if data.strip():
            self.text_parts.append(data.strip())


class _PinnedNetworkBackend(httpcore.AsyncNetworkBackend):
    def __init__(self, addresses: dict[str, str]) -> None:
        self._addresses = addresses
        self._backend = AutoBackend()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[tuple[int, int, int | bytes]] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        address = self._addresses.get(host.casefold())
        if address is None:
            raise httpcore.ConnectError("The requested host was not resolved for this scan")
        # HTTPCore keeps the original hostname for Host and TLS while the socket uses the checked IP.
        return await self._backend.connect_tcp(
            address,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Iterable[tuple[int, int, int | bytes]] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        return await self._backend.connect_unix_socket(
            path,
            timeout=timeout,
            socket_options=socket_options,
        )

    async def sleep(self, seconds: float) -> None:
        await self._backend.sleep(seconds)


class _CoreResponseStream(httpx.AsyncByteStream):
    def __init__(self, stream) -> None:
        self._stream = stream

    async def __aiter__(self) -> AsyncIterator[bytes]:
        async for part in self._stream:
            yield part

    async def aclose(self) -> None:
        await self._stream.aclose()


class _PinnedHTTPTransport(httpx.AsyncBaseTransport):
    def __init__(self, addresses: dict[str, str]) -> None:
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=ssl.create_default_context(),
            max_connections=1,
            max_keepalive_connections=0,
            keepalive_expiry=0,
            retries=0,
            network_backend=_PinnedNetworkBackend(addresses),
        )

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        core_request = httpcore.Request(
            method=request.method,
            url=httpcore.URL(
                scheme=request.url.raw_scheme,
                host=request.url.raw_host,
                port=request.url.port,
                target=request.url.raw_path,
            ),
            headers=request.headers.raw,
            content=request.stream,
            extensions=request.extensions,
        )
        try:
            response = await self._pool.handle_async_request(core_request)
        except (
            httpcore.ConnectError,
            httpcore.ConnectTimeout,
            httpcore.ReadError,
            httpcore.ReadTimeout,
            httpcore.RemoteProtocolError,
            httpcore.WriteError,
            httpcore.WriteTimeout,
        ) as exc:
            raise httpx.RequestError("The website request failed", request=request) from exc

        return httpx.Response(
            status_code=response.status,
            headers=response.headers,
            stream=_CoreResponseStream(response.stream),
            extensions=response.extensions,
            request=request,
        )

    async def aclose(self) -> None:
        await self._pool.aclose()


class WebsiteCrawler:
    def __init__(
        self,
        resolver: Callable[[str, int], Awaitable[dict[str, str]]] | None = None,
        transport_factory: Callable[[dict[str, str]], httpx.AsyncBaseTransport] | None = None,
    ) -> None:
        self._resolver = resolver or self._resolve_public_addresses
        self._transport_factory = transport_factory or _PinnedHTTPTransport

    async def _resolve_public_addresses(self, host: str, port: int) -> dict[str, str]:
        try:
            records = await asyncio.to_thread(
                socket.getaddrinfo,
                host,
                port,
                type=socket.SOCK_STREAM,
            )
        except OSError as exc:
            raise WebsiteFetchError("The website address could not be resolved") from exc

        addresses = {
            ipaddress.ip_address(record[4][0]).compressed
            for record in records
        }
        if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise WebsiteFetchError("The website address is not publicly accessible")
        return {host.casefold(): sorted(addresses)[0]}

    @staticmethod
    def _normalize_url(url: str, expected_host: str | None = None) -> str:
        try:
            parsed = urlsplit(url)
            port = parsed.port
            host = parsed.hostname
        except ValueError as exc:
            raise WebsiteFetchError("The website address is invalid") from exc

        if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
            raise WebsiteFetchError("Only public HTTP and HTTPS website addresses are supported")
        if host.casefold() == "localhost" or host.casefold().endswith((".localhost", ".local", ".internal")):
            raise WebsiteFetchError("The website address is not publicly accessible")
        expected_port = 443 if parsed.scheme == "https" else 80
        if port not in {None, expected_port}:
            raise WebsiteFetchError("This website port is not supported")

        try:
            normalized_host = host.encode("idna").decode("ascii").casefold()
        except UnicodeError as exc:
            raise WebsiteFetchError("The website address is invalid") from exc
        if expected_host and normalized_host != expected_host:
            raise WebsiteFetchError("Only pages from the same website can be selected")
        try:
            address = ipaddress.ip_address(normalized_host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise WebsiteFetchError("The website address is not publicly accessible")

        netloc = f"[{normalized_host}]" if ":" in normalized_host else normalized_host
        if port is not None:
            netloc = f"{netloc}:{port}"
        path = parsed.path or "/"
        return urlunsplit((parsed.scheme, netloc, path, parsed.query, ""))

    async def _fetch_page(self, url: str, root_host: str) -> FetchedPage:
        current_url = url
        for _ in range(MAX_REDIRECTS + 1):
            normalized = self._normalize_url(current_url, expected_host=root_host)
            parsed = urlsplit(normalized)
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            addresses = await self._resolver(parsed.hostname or "", port)
            transport = self._transport_factory(addresses)
            async with httpx.AsyncClient(
                transport=transport,
                timeout=REQUEST_TIMEOUT_SECONDS,
                trust_env=False,
                follow_redirects=False,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
            ) as client:
                try:
                    async with client.stream("GET", normalized) as response:
                        if response.status_code in {301, 302, 303, 307, 308}:
                            location = response.headers.get("location")
                            if not location:
                                raise WebsiteFetchError("The website returned an invalid redirect")
                            current_url = urljoin(normalized, location)
                            continue
                        if not response.is_success:
                            raise WebsiteFetchError("The website did not allow this page to be read")
                        if "text/html" not in response.headers.get("content-type", "").casefold():
                            raise WebsiteFetchError("This website page is not an HTML page")
                        length = response.headers.get("content-length")
                        if length:
                            try:
                                too_large = int(length) > MAX_PAGE_BYTES
                            except ValueError:
                                too_large = False
                            if too_large:
                                raise WebsiteFetchError("This website page is too large to read")

                        body = bytearray()
                        async for chunk in response.aiter_bytes():
                            body.extend(chunk)
                            if len(body) > MAX_PAGE_BYTES:
                                raise WebsiteFetchError("This website page is too large to read")
                        parser = _PageParser()
                        parser.feed(bytes(body).decode(response.encoding or "utf-8", errors="replace"))
                        title = " ".join(" ".join(parser.title_parts).split()) or normalized
                        text = " ".join(" ".join(parser.text_parts).split())
                        links = [urljoin(normalized, href) for href in parser.links]
                        return FetchedPage(normalized, title, text, links)
                except httpx.RequestError as exc:
                    raise WebsiteFetchError("The website could not be reached") from exc

        raise WebsiteFetchError("The website redirected too many times")

    async def scan(self, url: str) -> list[FetchedPage]:
        normalized = self._normalize_url(url)
        root_host = urlsplit(normalized).hostname or ""
        try:
            async with asyncio.timeout(CRAWL_TIMEOUT_SECONDS):
                pages: dict[str, FetchedPage] = {}
                pending = deque([normalized])
                while pending and len(pages) < MAX_PAGES:
                    batch: list[str] = []
                    while pending and len(batch) < CRAWL_CONCURRENCY and len(pages) + len(batch) < MAX_PAGES:
                        candidate = pending.popleft()
                        if candidate not in pages and candidate not in batch:
                            batch.append(candidate)
                    results = await asyncio.gather(
                        *(self._fetch_page(candidate, root_host) for candidate in batch),
                        return_exceptions=True,
                    )
                    for candidate, result in zip(batch, results):
                        if isinstance(result, FetchedPage):
                            pages[result.url] = result
                            for link in result.links:
                                try:
                                    normalized_link = self._normalize_url(link, expected_host=root_host)
                                except WebsiteFetchError:
                                    continue
                                if normalized_link not in pages and normalized_link not in pending:
                                    pending.append(normalized_link)
                        elif candidate == normalized:
                            raise result
                if not pages:
                    raise WebsiteFetchError("No readable pages were found")
                return list(pages.values())
        except TimeoutError as exc:
            raise WebsiteFetchError("The website scan took too long") from exc

    async def fetch_selected(self, base_url: str, selected_urls: list[str]) -> list[FetchedPage]:
        normalized_base = self._normalize_url(base_url)
        root_host = urlsplit(normalized_base).hostname or ""
        unique_urls: list[str] = []
        for url in selected_urls:
            normalized = self._normalize_url(url, expected_host=root_host)
            if normalized not in unique_urls:
                unique_urls.append(normalized)
        if len(unique_urls) > MAX_PAGES:
            raise WebsiteFetchError(f"At most {MAX_PAGES} pages can be added at once")
        results = await asyncio.gather(
            *(self._fetch_page(url, root_host) for url in unique_urls),
            return_exceptions=True,
        )
        failed = next((result for result in results if isinstance(result, Exception)), None)
        if failed:
            raise WebsiteFetchError("One or more selected pages could not be read") from failed
        return [result for result in results if isinstance(result, FetchedPage)]


class WebsiteService:
    def __init__(
        self,
        db: AsyncSession,
        crawler: WebsiteCrawler | None = None,
        embedding_provider: EmbeddingProvider | None = None,
    ) -> None:
        self.db = db
        self.crawler = crawler or WebsiteCrawler()
        self.embedding_provider = embedding_provider

    async def scan(self, url: str) -> list[FetchedPage]:
        try:
            return await self.crawler.scan(url)
        except WebsiteFetchError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    async def import_pages(
        self,
        agent_id: uuid.UUID,
        url: str,
        selected_urls: list[str],
    ) -> list[Document]:
        try:
            pages = await self.crawler.fetch_selected(url, selected_urls)
        except WebsiteFetchError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
        if any(not page.text for page in pages):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="One or more selected pages contain no readable text",
            )

        document_service = DocumentService(self.db, self.embedding_provider)
        documents: list[Document] = []
        for page in pages:
            safe_name = page.url.replace("://", "_").replace("/", "_").replace("?", "_")[:220]
            document = await document_service.upload_document(
                agent_id=agent_id,
                filename=f"{safe_name}.txt",
                content=page.text.encode("utf-8"),
                content_type="text/plain",
                source_metadata={"source_type": "website", "source_url": page.url},
            )
            documents.append(document)
        return documents
