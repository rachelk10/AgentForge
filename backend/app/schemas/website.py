from pydantic import BaseModel, Field, HttpUrl


class WebsiteScanRequest(BaseModel):
    url: HttpUrl


class WebsitePageResponse(BaseModel):
    url: HttpUrl
    title: str


class WebsiteScanResponse(BaseModel):
    pages: list[WebsitePageResponse]


class WebsiteImportRequest(BaseModel):
    url: HttpUrl
    pages: list[HttpUrl] = Field(min_length=1, max_length=20)
