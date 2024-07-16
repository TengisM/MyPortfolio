'use client'
import * as React from 'react';

export default function Footer() {
    const [ date, setDate ] = React.useState('');

    React.useEffect(() => {
        const currentDate = new Date();
        const month = currentDate.toLocaleString('default', { month: 'long' });
        const year = currentDate.getFullYear();
        setDate(`${month} ${year}`);
    }, []);

	return (
        <footer className="z-10 w-full h-40 grid items-center justify-center">
            <div className="font-mono text-sm flex flex-col text-center">
                <span className='cursor-default'>{'© Tenggis Munkhbaatar'}</span>
                <span>{'<> '}{date}{' </>'}</span>
            </div>
        </footer>
	);
};
