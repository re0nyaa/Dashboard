import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
    route("api/holidays", "routes/api.holidays.ts"),
    route("api/news", "routes/api.news.ts"),
    route("api/schedule", "routes/api.schedule.ts"),
    route("api/weather", "routes/api.weather.ts"),
    route("callback", "routes/callback.tsx"),
    index("routes/home.tsx"),

    route(".well-known/*", "routes/empty.ts"),
    //well-known/* 로그 좀 그만 띄어라
] satisfies RouteConfig
