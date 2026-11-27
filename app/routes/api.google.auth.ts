import {
    buildClearAuthCookies,
    fetchGoogleUserProfile,
    getValidGoogleSession,
} from "../utils/googleAuth.server"

export async function loader({ request }: { request: Request }) {
    const session = await getValidGoogleSession(request)
    if (!session) {
        return Response.json(
            { connected: false, user: null },
            { headers: { "cache-control": "no-store" } }
        )
    }

    const user = await fetchGoogleUserProfile(session.accessToken)
    const headers = new Headers({ "cache-control": "no-store" })
    for (const c of session.setCookies) headers.append("Set-Cookie", c)

    return Response.json({ connected: true, user }, { headers })
}

export async function action({ request }: { request: Request }) {
    if (request.method !== "DELETE" && request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 })
    }
    const headers = new Headers({ "cache-control": "no-store" })
    for (const c of buildClearAuthCookies()) headers.append("Set-Cookie", c)
    return Response.json({ ok: true }, { headers })
}
