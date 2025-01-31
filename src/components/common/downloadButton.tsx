'use client';
import Image from 'next/image';
import * as React from 'react';
import * as motion from 'motion/react-client';
import { Download } from '../../../public/common';

const DownloadButton = () => {
    const [ isLoading, setIsLoading ] = React.useState<boolean>(false);
    const handleDownload = async () => {
        try {
            setIsLoading(true);
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
        } catch (error) {
            console.error('Error downloading CV:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const draw = {
        hidden: { pathLength: 0, opacity: 0 },
        visible: (i: number) => {
            const delay = i * 0.5;
            return {
                pathLength: 1,
                opacity: 1,
                transition: {
                    pathLength: { delay, type: "spring", duration: 1.5, bounce: 0 },
                    opacity: { delay, duration: 0.01 },
                },
            }
        },
    };

    return (
        <motion.button
            className='flex items-center gap-2 py-2 px-4 border rounded-full hover:bg-cyan-700'
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.8 }}
            onClick={handleDownload}
        >
            {isLoading ? (
                <motion.svg
                    width="20"
                    height="20"
                    viewBox="0 0 600 600"
                    initial="hidden"
                    animate="visible"
                    className="max-w-[10vw]"
                >
                    <motion.circle
                        className="circle-path"
                        cx="100"
                        cy="100"
                        r="80"
                        stroke="#ff0088"
                        variants={draw}
                        custom={1}
                        style={{ strokeWidth: '10', strokeLinecap: "round", fill: "transparent" }}
                    />
                </motion.svg>
            ) : (
                <Image
                    src={Download}
                    alt='download_icon'
                    className='size-5'
                />
            )}
            CV download
        </motion.button>
    );
};

export default DownloadButton;