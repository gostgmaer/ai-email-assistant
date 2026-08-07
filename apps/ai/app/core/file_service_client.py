from file_upload_sdk import AsyncFileUploadClient

from app.config.settings import settings


class FileServiceClient:
    """Thin wrapper around easydev-file-upload-sdk's AsyncFileUploadClient —
    the Python counterpart to the @easydev_org/file-upload-sdk Node client
    apps/api uses for uploads. Downloads are identity-scoped per call, not
    signature-verified server-side today (see the SDK's own README): the
    X-Tenant-Id/X-User-Id/X-User-Role/X-User-Email headers we send are
    trusted as-is by file-upload-service.
    """

    def __init__(self) -> None:
        self._client = AsyncFileUploadClient(
            base_url=settings.file_service_url,
            tenant_id=settings.file_service_tenant_id,
            gateway_secret=settings.file_service_hmac_secret,
        )

    async def download(
        self,
        file_id: str,
        user_id: str,
        user_email: str = "",
        user_role: str = "anonymous",
        tenant_id: str | None = None,
    ) -> bytes:
        response = await self._client.download_file(
            file_id,
            user_id=user_id,
            user_email=user_email,
            user_role=user_role,
            tenant_id=tenant_id,
        )
        return response.content


file_service_client = FileServiceClient()
