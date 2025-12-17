import { useEffect } from "react"
import { useToaster } from "../components/Toaster"

export function useConnectivityToasts() {
    const { pushToast } = useToaster()

    useEffect(() => {
        const offline = () =>
            pushToast("인터넷 연결이 끊어졌습니다.", {
                kind: "error",
                durationMs: 5000,
            })
        const online = () =>
            pushToast("인터넷에 다시 연결되었습니다.", {
                kind: "success",
                durationMs: 3200,
            })

        window.addEventListener("offline", offline)
        window.addEventListener("online", online)

        return () => {
            window.removeEventListener("offline", offline)
            window.removeEventListener("online", online)
        }
    }, [pushToast])
}
