import { buildStateCookie, createGoogleAuthUrl } from "../utils/googleAuth.server"

export async function loader({ request }: { request: Request }) {
    try {
        const { url, state } = createGoogleAuthUrl(request.url)
        return new Response(null, {
            status: 302,
            headers: {
                Location: url,
                "Set-Cookie": buildStateCookie(state),
            },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : "Google OAuth 설정 오류"
        return new Response(
            `<!doctype html><html><body style="font-family:sans-serif;padding:24px;background:#111;color:#fff"><h2>Google 로그인 설정 필요</h2><p>${message}</p><a href="/" style="color:#6E8BFF">대시보드로 돌아가기</a></body></html>`,
            {
                status: 500,
                headers: { "content-type": "text/html; charset=utf-8" },
            }
        )
    }
}
