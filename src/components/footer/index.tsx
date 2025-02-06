export default function Footer() {
    return (
        <footer className="z-10 py-8 w-full border-t border-transparent">
            <div className="container mx-auto px-4">
                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="h-px w-full max-w-2xl bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
                    <p 
                        className="font-mono text-sm bg-gradient-to-r from-cyan-400 to-purple-300 bg-clip-text text-transparent 
                                hover:animate-pulse cursor-default transition-all duration-300"
                        style={{ textShadow: '0 0 8px rgba(165, 180, 252, 0.4)' }}
                    >
                        {'<> '}&copy; 2025 Tenggis Munkhbaatar{' </>'}
                    </p>
                    <div className="flex space-x-6">
                        <a href="https://github.com/TengisM" target="_blank" rel="noopener noreferrer" 
                           className="text-indigo-300 duration-300 transform hover:scale-110">
                            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                                <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                            </svg>
                        </a>
                        <a href="https://www.linkedin.com/in/tenggis-munkhbaatar-2a32b025a/" target="_blank" rel="noopener noreferrer" 
                           className="text-indigo-300 duration-300 transform hover:scale-110">
                            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                                <path d="M19 0H5a5 5 0 00-5 5v14a5 5 0 005 5h14a5 5 0 005-5V5a5 5 0 00-5-5zM8 19H5V8h3v11zM6.5 6.732c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zM20 19h-3v-5.604c0-3.368-4-3.113-4 0V19h-3V8h3v1.765c1.396-2.586 7-2.777 7 2.476V19z"/>
                            </svg>
                        </a>
                        <a href="" target="_blank" rel="noopener noreferrer" 
                           className="text-indigo-300 duration-300 transform hover:scale-110 -mt-0.5">
                            <svg className="w-7 h-7 fill-current" viewBox="0 0 50 50">
                                <path d="M25,2C12.318,2,2,12.317,2,25s10.318,23,23,23c12.683,0,23-10.317,23-23S37.683,2,25,2z M32,16h-3.29 C26.772,16,26,16.455,26,17.806V21h6l-1,5h-5v13h-6V26h-3v-5h3v-2.774C20,14.001,21.686,11,26.581,11C29.203,11,32,12,32,12V16z"/>
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
};
