import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
    route("api/holidays", "routes/api.holidays.ts"),
    route("api/news", "routes/api.news.ts"),
    route("api/safety-alert", "routes/api.safety-alert.ts"),
    route("api/schedule", "routes/api.schedule.ts"),
    route("api/weather", "routes/api.weather.ts"),
    route("api/google/auth", "routes/api.google.auth.ts"),
    route("api/google/events", "routes/api.google.events.ts"),
    route("auth/google", "routes/auth.google.ts"),
    route("auth/google/callback", "routes/auth.google.callback.tsx"),
    route("callback", "routes/callback.tsx"),
    index("routes/home.tsx"),
] satisfies RouteConfig
