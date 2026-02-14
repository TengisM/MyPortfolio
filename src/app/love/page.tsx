"use client";
import { useState, useRef, useEffect } from "react";

const messages = [
    "Are you sure? 🥺",
    "Really sure? 😢",
    "Think again... 💔",
    "Pretty pleaseee? 😭",
    "Last chance! 💖"
];

export default function Home() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [yesSize, setYesSize] = useState(24);
  const [isPlaying, setIsPlaying] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = 0.5;
            audioRef.current.play().catch(() => {});
            setIsPlaying(true);
        }
    }, []);

    const toggleMusic = () => {
        if (!audioRef.current) return;

        if (audioRef.current.paused) {
            audioRef.current.play();
            setIsPlaying(true);
        } else {
            audioRef.current.pause();
            setIsPlaying(false);
        }
    };

    const handleNoClick = () => {
        setMessageIndex((prev) => (prev + 1) % messages.length);
        setYesSize((prev) => prev * 1.3);
    };

    const handleYesClick = () => {
        setAccepted(true);
    };

    return (
        <main className="flex flex-col items-center justify-center min-h-screen bg-linear-to-br from-rose-200 via-pink-100 to-rose-300 text-center p-6 relative">
            <audio
                ref={audioRef}
                src="/OneRepublic - I Ain't Worried.flac"
                loop
            />
            <button
                onClick={toggleMusic}
                className="absolute top-4 right-4 bg-rose-50/90 text-rose-800 border border-rose-200 px-4 py-2 rounded-full shadow-md hover:bg-rose-100 transition-colors"
            >
                {isPlaying ? "🔊 Music On" : "🔇 Music Off"}
            </button>

            {accepted ? (
                <>
                    <h1 className="text-4xl font-bold mb-6 text-rose-900">
                        YAAAYYY!!! 💕💖💘
                    </h1>
                    <img
                        src="https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif"
                        alt="Happy love gif"
                        className="w-72 mb-6 rounded-xl shadow-lg"
                    />
                    <p className="text-xl text-rose-800">
                        I love you soooo much! 🥰
                        You just made my day ❤️
                    </p>
                    <p className="text-lg text-rose-800 mt-4 max-w-md">
                        And hey — you got this thing. 🎤 It&apos;s your first big gig and you&apos;re singing. I&apos;m so proud of you. Go crush it! ✨
                    </p>
                </>
            ) : (
                <>
                    <h1 className="text-3xl font-bold mb-6 text-rose-900">
                        Will you be my Valentine? 💘
                    </h1>
                    <img
                        src="https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif"
                        alt="Cute love gif"
                        className="w-64 mb-6 rounded-xl shadow-lg"
                    />
                    <p className="mb-4 text-lg text-rose-800">
                        {messages[messageIndex]}
                    </p>
                    <div className="flex gap-6 mt-4">
                        <button
                            onClick={handleYesClick}
                            style={{ fontSize: `${yesSize}px` }}
                            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-full transition-all duration-300"
                        >
                            Yes 💖
                        </button>
                        <button
                            onClick={handleNoClick}
                            className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full transition-all duration-300"
                        >
                            No 😢
                        </button>
                    </div>
                </>
            )}
        </main>
    );
}
