import { NextResponse } from "next/server";
import { Resend } from "resend";
import emailTemplate from "@/lib/emailTemplate";

interface IEmail {
    name: string;
    email: string;
    message: string;
};

export async function POST(params: Request) {
    const { name, email, message }: IEmail = await params.json();
    const resend = new Resend(process.env.RESEND_API_KEY);

    try {
        await resend.emails.send({
            from: email,
            to: 'diditrimorum72@gmail.com',
            subject: 'From portfolio!',
            react: emailTemplate({ name, email, message })
        });

        return NextResponse.json({ message: `Email sent successfully!` }, { status: 200 })
    } catch (err) {
        return NextResponse.json({ err }, { status: 500 })
    }
};
