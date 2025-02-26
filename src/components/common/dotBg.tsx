"use client";
import * as React from "react";

const DotBackground = () => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const dots = Array.from({ length: 400 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: Math.random() * 1.5,
            opacity: 0.4,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
        }));

        let animationFrameId: number;

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            dots.forEach(dot => {
                dot.x += dot.vx;
                dot.y += dot.vy;
                
                if (dot.x <= 0 || dot.x >= canvas.width) dot.vx *= -1;
                if (dot.y <= 0 || dot.y >= canvas.height) dot.vy *= -1;

                ctx.beginPath();
                ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(156, 163, 175, ${dot.opacity})`;
                ctx.fill();
            });

            for (let i = 0; i < dots.length; i++) {
                for (let j = i + 1; j < dots.length; j++) {
                    const dx = dots[i].x - dots[j].x;
                    const dy = dots[i].y - dots[j].y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < 10000) {
                        const dist = Math.sqrt(distSq);
                        const lineAlpha = (1 - dist / 100) * 0.4;
                        ctx.beginPath();
                        ctx.moveTo(dots[i].x, dots[i].y);
                        ctx.lineTo(dots[j].x, dots[j].y);
                        ctx.strokeStyle = `rgba(156, 163, 175, ${lineAlpha})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
};

export default DotBackground;
