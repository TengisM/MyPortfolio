"use client";
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { WhiteLogo } from "../../../public/headerLogo";

const headerItems = [
    { scrollId: "home", label: "Home" },
    { scrollId: "about", label: "About" },
    { scrollId: "projects", label: "Projects" },
];

const NAV_DELAY = 0.2;
const NAV_ITEM_DELAY = 0.1;

const Path = (props: React.ComponentProps<typeof motion.path>) => (
    <motion.path
        fill="transparent"
        strokeWidth="3"
        stroke="currentColor"
        strokeLinecap="round"
        {...props}
    />
);

const MenuToggle = ({ toggle, isOpen }: { toggle: () => void; isOpen: boolean }) => (
    <motion.button
        id="menu-toggle"
        onClick={toggle}
        className="text-white md:hidden"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        initial={false}
    >
        <svg width="23" height="23" viewBox="0 0 23 23">
            <Path
                initial="closed"
                variants={{
                    closed: { d: "M 2 2.5 L 20 2.5" },
                    open: { d: "M 3 16.5 L 17 2.5" },
                }}
                animate={isOpen ? "open" : "closed"}
                transition={{ duration: 0.3 }}
            />
            <Path
                initial="closed"
                animate={isOpen ? "open" : "closed"}
                variants={{
                    closed: { 
                        opacity: 1, 
                        d: "M 2 9.423 L 20 9.423",
                        transition: { duration: 0.1 } 
                    },
                    open: { 
                        opacity: 0, 
                        d: "M 2 9.423 L 20 9.423",
                        transition: { duration: 0.1 } 
                    }
                }}
            />
            <Path
                initial="closed"
                variants={{
                    closed: { d: "M 2 16.346 L 20 16.346" },
                    open: { d: "M 3 2.5 L 17 16.346" },
                }}
                animate={isOpen ? "open" : "closed"}
                transition={{ duration: 0.3 }}
            />
        </svg>
    </motion.button>
);

export default function Header() {
    const pathname = usePathname();
    const menuRef = React.useRef<HTMLDivElement>(null);
    const [ isMobileOpen, setIsMobileOpen ] = React.useState<boolean>(false);

    const isActive = (scrollId: string) => (scrollId === "home" && pathname === "/") || pathname === `/${scrollId}`;

    React.useEffect(() => {
        if (!isMobileOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node) &&
                !(event.target as HTMLElement).closest("#menu-toggle")
            ) {
                setIsMobileOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isMobileOpen]);

    return (
        <header className="fixed top-0 z-50 w-full backdrop-blur-md bg-neutral-900/80 shadow-2xl border-b border-neutral-700">
            <nav className="max-w-7xl mx-auto my-1 px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                        <Link href="/" className="flex items-center">
                            <Image
                                className="rounded-lg bg-white p-1"
                                src={WhiteLogo}
                                alt="logo"
                                width={50}
                                height={50}
                            />
                        </Link>
                    </motion.div>

                    <div className="hidden md:flex items-center space-x-7">
                        {headerItems.map((item, index) => (
                            <NavItem 
                                key={item.scrollId}
                                item={item}
                                index={index}
                                isActive={isActive(item.scrollId)}
                            />
                        ))}
                    </div>

                    <MenuToggle 
                        toggle={() => setIsMobileOpen((prev) => !prev)}
                        isOpen={isMobileOpen}
                    />
                </div>

                <AnimatePresence>
                    {isMobileOpen && (
                        <motion.div
                            ref={menuRef}
                            className="md:hidden"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                        >
                            <div className="pb-4 pt-2 text-center space-y-4">
                                {headerItems.map((item) => (
                                    <div key={item.scrollId}>
                                        <div className="h-px w-full max-w-2xl bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50"/>
                                        <Link
                                            href={item.scrollId === "home" ? "/" : `/${item.scrollId}`}
                                            className="block mt-3 px-3 py-2 rounded-lg text-xl font-medium text-white hover:bg-neutral-700/50 transition-colors"
                                            onClick={() => setIsMobileOpen(false)}
                                        >
                                            {item.label}
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>
        </header>
    );
};

const NavItem = ({ item, index, isActive }: NavItemProps) => (
    <Link
        href={item.scrollId === "home" ? "/" : `/${item.scrollId}`}
        className="relative group px-3 py-2"
    >
        <motion.span
            className={`text-lg font-medium transition-colors duration-300 ${
                isActive ? "text-cyan-400" : "text-white hover:text-cyan-300"
            }`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: NAV_DELAY + index * NAV_ITEM_DELAY }}
        >
            {item.label}
        </motion.span>

        {isActive && (
            <motion.div
                className="absolute left-0 -bottom-1 h-0.5 w-full bg-cyan-400 origin-left"
                layoutId="activeNav"
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
            />
        )}
    </Link>
);
