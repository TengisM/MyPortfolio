"use client";
import * as React from "react";
import { frame, motion, useMotionValue, useSpring } from "motion/react";

export default function HoverEffect() {
    const ref = React.useRef<HTMLDivElement>(null);
    const { x, y } = useFollowPointer(ref);

    return <motion.div
        className="fixed md:size-80 opacity-25 transition-colors duration-800 rounded-full bg-radial from-cyan-400 to-black"
        ref={ref}
        style={{
            x, y
        }}
    />
};

const spring = { damping: 25, stiffness: 150, restDelta: 0.01 };

export function useFollowPointer(ref: React.RefObject<HTMLDivElement | null>) {
    const xPoint = useMotionValue(0);
    const yPoint = useMotionValue(0);
    const x = useSpring(xPoint, spring);
    const y = useSpring(yPoint, spring);

    React.useEffect(() => {
        if (!ref.current) return

        const handlePointerMove = ({ clientX, clientY }: MouseEvent) => {
            const element = ref.current!

            frame.read(() => {
                xPoint.set(
                    clientX - element.offsetLeft - element.offsetWidth / 2
                )
                yPoint.set(
                    clientY - element.offsetTop - element.offsetHeight / 2
                )
            })
        };

        window.addEventListener("pointermove", handlePointerMove);

        return () =>
            window.removeEventListener("pointermove", handlePointerMove)
    }, [ref, xPoint, yPoint]);

    return { x, y };
};
