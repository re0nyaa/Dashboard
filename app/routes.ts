import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
    route("api/holidays", "routes/api.holidays.ts"),
    route("api/news", "routes/api.news.ts"),
    route("api/schedule", "routes/api.schedule.ts"),
    route("api/weather", "routes/api.weather.ts"),
    route("callback", "routes/callback.tsx"),
    index("routes/home.tsx"),
] satisfies RouteConfig
