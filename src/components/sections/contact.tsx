'use client'
import * as React from 'react';
import axios from 'axios';

interface IEmail {
    name: string;
    email: string;
    message: string;
};

export default function Contact() {
    const [ formData, setFormData ] = React.useState<IEmail>({
        name: '',
        email: '',
        message: '',
    });
    // const [ fileName, setFileName ] = React.useState('');
    // const [ file, setFile ] = React.useState<File | undefined>(undefined);

    const handleChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    }, []);

    // const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    //     const selectedFile = e.target.files?.[0];
    //     if (selectedFile) {
    //         setFile(selectedFile);
    //         setFileName(selectedFile.name);
    //     }
    // };

    const handleSubmit = React.useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const res = await axios.post('/api/send', formData, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            alert(res.data.message);
        } catch (err) {
            console.error('Error sending email:', err);
            alert('Failed to send email.');
        }
    }, [formData]);

    return (
        <section id='contact' className="w-full max-w-screen-xl px-5 mt-16 mb-40 box-border">
            <span className='md:text-xl text-cyan-400'>Contact (Sorry, Soon)</span>
            <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-4 mt-5 md:mt-10 blur-sm">
                <input
                    type="text"
                    id="name"
                    name="name"
                    placeholder='Name'
                    value={formData.name}
                    onChange={handleChange}
                    className="col-span-4 md:col-span-2 w-full p-2 border-b bg-transparent border-gray-300 focus:outline-none"
                    required
                    disabled
                />
                <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder='E-mail'
                    value={formData.email}
                    onChange={handleChange}
                    className="col-span-4 md:col-span-2 w-full p-2 border-b bg-transparent border-gray-300 focus:outline-none"
                    required
                    disabled
                />
                <textarea
                    id="message"
                    name="message"
                    placeholder="Type anything (I'll read)..."
                    value={formData.message}
                    onChange={handleChange}
                    className="col-span-4 w-full p-2 border rounded-lg bg-transparent border-gray-300 focus:outline-none"
                    rows={4}
                    required
                    disabled
                />
                {/* <label htmlFor="file-upload" className="border border-dashed rounded-lg text-center content-center cursor-pointer col-span-2 md:col-span-1 bg-transparent text-cyan-400">
                    <span>Upload a file</span>
                    <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        onChange={handleFileChange}
                        className="sr-only"
                    />
                </label>
                {fileName && (
                    <div className='content-center'>
                        {fileName}
                        <button
                            type="button"
                            onClick={() => {
                                setFile(undefined);
                                setFileName('');
                            }}
                            className="text-red-500 border border-red-500 rounded-md px-2 ml-2"
                        >
                            X
                        </button>
                    </div>
                )} */}
                <button
                    disabled
                    type="submit"
                    className="col-span-4 md:col-span-1 md:col-end-5 items-center px-4 py-2 border border-cyan-400 font-medium rounded-md text-white"
                >
                    Submit
                </button>
            </form>
        </section>
    );
};
