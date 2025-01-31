"use client"
import Image from "next/image";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WhiteLogo } from "../../../public/headerLogo";

const headerItems: IHeaderItem[] = [
    { scrollId: 'home', label: 'Home' },
    { scrollId: 'about', label: 'About' },
    { scrollId: 'projects', label: 'Projects' },
    // { scrollId: 'contact', label: 'Contact' },
];

export default function Header() {
    const pathname = usePathname();

    return (
        <header className="w-full top-0 fixed bg-[#222227]/80 backdrop-blur-md shadow-md z-[100]">
            <nav className="max-w-screen-xl w-full mx-auto flex justify-between items-center p-4">
                <Link href={"/"}>
                    <Image
                        className="rounded-lg content-center mr-5 w-8 md:w-12 cursor-pointer bg-white backdrop-blur-sm"
                        src={WhiteLogo}
                        alt="logo"
                    />
                </Link>
                <div className="flex gap-6">
                    {headerItems.map((item, index) => {
                        const isCurrentPage = (item.scrollId === "home" && pathname === "/") || pathname === `/${item.scrollId}`;
                        return (
                            <Link
                                className='relative'
                                href={item.scrollId === "home" ? "/" : `/${item.scrollId}`}
                                key={index + item.label}
                            >
                                <h3 className={`md:text-xl cursor-pointer font-semibold hover:text-cyan-400 
                                    ${isCurrentPage ? 'border-b-2 border-cyan-400 text-cyan-400' : ''}`}>
                                    {item.label}
                                </h3>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </header>
    );
};
