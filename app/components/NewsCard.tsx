interface NewsCardProps {
    title: string
    description: string
    imageUrl: string
}

export function NewsCard({ title, description, imageUrl }: NewsCardProps) {
    return (
        <div className="w-[860px] h-[440px] bg-[#4b4b4b] rounded-[30px] overflow-hidden group hover:bg-[#555] transition-all duration-300 hover:shadow-2xl hover:shadow-white/10">
            <div className="relative h-full flex flex-col p-10">
                <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-300">
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#4b4b4b] via-[#4b4b4b]/50 to-transparent" />
                </div>

                <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-end mb-4">
                        <div className="w-[38px] h-[38px] bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm hover:bg-white/20 transition-colors duration-300 cursor-pointer">
                            <svg
                                className="w-5 h-5 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                />
                            </svg>
                        </div>
                    </div>

                    <h2 className="text-white text-4xl font-bold mb-6 leading-tight group-hover:translate-x-2 transition-transform duration-300">
                        {title}
                    </h2>

                    <p className="text-white/80 text-lg leading-relaxed line-clamp-4 group-hover:text-white transition-colors duration-300">
                        {description}
                    </p>

                    <div className="mt-auto flex items-center gap-3">
                        <button className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors duration-300 backdrop-blur-sm">
                            <svg
                                className="w-5 h-5 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                />
                            </svg>
                        </button>
                        <button className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors duration-300 backdrop-blur-sm">
                            <svg
                                className="w-5 h-5 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
