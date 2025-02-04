'use client';
import Image from 'next/image';
import * as React from 'react';
import * as motion from 'motion/react-client';
import { AnimatePresence } from 'motion/react';
import { Download } from '../../../public/common';

type State = {
    isSuccess: boolean;
    error: string | null;
};

const DownloadButton = () => {
    const [isMounted, setIsMounted] = React.useState(false);
    const [state, action, isPending] = React.useActionState<State>(
        async () => {
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const response = await fetch('/api/download-cv');
                if (!response.ok) throw new Error('Download failed');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Tenggis_CV.pdf';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                return { isSuccess: true, error: null };
            } catch (error) {
                console.error('Error downloading CV:', error);
                return { isSuccess: false, error: error instanceof Error ? error.message : 'Download failed' };
            }
        },
        { isSuccess: false, error: null }
    );

    React.useEffect(() => {
        setIsMounted(true);
    }, []);

    return (
        <motion.div
            className="relative group"
            initial={false}
        >
            <form action={action}>
                <motion.button
                    className={`flex cursor-pointer items-center gap-3 py-3 px-6 rounded-full backdrop-blur-lg transition-all
                        ${
                            isPending || state.isSuccess 
                            ? 'bg-gradient-to-br from-cyan-400/30 to-purple-500/30' 
                            : 'bg-gradient-to-br from-cyan-400/20 to-purple-500/20 hover:from-cyan-400/30 hover:to-purple-500/30'
                        }`}
                    type="submit"
                    disabled={isPending || state.isSuccess}
                    initial={{ scale: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                <div className="relative w-6 h-6 flex items-center justify-center">
                    <AnimatePresence mode='wait'>
                        {isPending ? (
                            <motion.svg
                                key="loading"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                initial={{ rotate: 0 }}
                                animate={{ rotate: 360 }}
                                transition={{ 
                                    duration: 1,
                                    repeat: Infinity,
                                    ease: "linear"
                                }}
                            >
                                <path
                                    d="M12 2V6M12 18V22M6 12H2M22 12H18M19.0784 19.0784L16.25 16.25M19.0784 4.99994L16.25 7.82837M4.92157 19.0784L7.75 16.25M4.92157 4.99994L7.75 7.82837"
                                />
                            </motion.svg>
                        ) : state.isSuccess ? (
                            <motion.svg
                                key="success"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <motion.path
                                    d="M20 6L9 17L4 12"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 0.5 }}
                                />
                            </motion.svg>
                        ) : (
                            <motion.div
                                key="download"
                                initial={{ opacity: 1 }}
                            >
                                <Image
                                    src={Download}
                                    alt='download_icon'
                                    className='w-6 h-6'
                                    priority
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <span className="text-sm font-medium">
                    {state.isSuccess ? 'Downloaded!' : 'Get My CV'}
                </span>

                {isMounted && (
                    <>
                        <motion.div
                            className="absolute inset-0 rounded-full pointer-events-none"
                            initial={{ opacity: 0 }}
                            animate={{
                                opacity: 1,
                                border: '1px solid rgba(34, 211, 238, 0.4)'
                            }}
                            transition={{ duration: 0.3 }}
                        />

                        <div className="absolute inset-0 overflow-hidden rounded-full">
                            <motion.div
                                className="absolute top-0 w-1/3 h-full bg-gradient-to-r from-transparent via-cyan-200/20 to-transparent"
                                initial={{ left: '-50%' }}
                                animate={{ left: '150%' }}
                                transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    delay: 0.5
                                }}
                            />
                        </div>
                    </>
                )}
            </motion.button>
        </form>

        {isMounted && (
            <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
                {[...Array(8)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-cyan-400 rounded-full"
                        initial={{
                            scale: 0,
                            opacity: 0,
                            x: Math.random() * 40 - 20,
                            y: Math.random() * 40 - 20
                        }}
                        animate={{
                            scale: 1,
                            opacity: 0.4,
                            transition: {
                            delay: i * 0.1,
                            duration: 0.5
                            }
                        }}
                    />
                ))}
            </div>
        )}
        </motion.div>
    );
};

export default DownloadButton;
