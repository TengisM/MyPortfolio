import {
    Body,
    Container,
    Head,
    Hr,
    Html,
    Preview,
    Section,
    Text,
} from '@react-email/components';

interface IEmail {
    name: string;
    email: string;
    message: string;
};
  
export const emailTemplate = ({ name, email, message }: IEmail) => (
    <Html>
        <Head />
        <Preview>Email from {name}!</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section style={box}>
                    <Hr style={hr} />
                    <Text style={paragraph}>
                        {message}
                    </Text>
                    <Text style={paragraph}>— {email}</Text>
                    <Hr style={hr} />
                    <Text style={footer}>
                        Tenggis, Alameda, CA
                    </Text>
                </Section>
            </Container>
        </Body>
    </Html>
)

export default emailTemplate;

const main = {
    backgroundColor: "#f6f9fc",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: "#ffffff",
    margin: "0 auto",
    padding: "20px 0 48px",
    marginBottom: "64px",
};

const box = {
    padding: "0 48px",
};

const hr = {
    borderColor: "#e6ebf1",
    margin: "20px 0",
};

const paragraph = {
    color: "#525f7f",
    fontSize: "16px",
    lineHeight: "24px",
    textAlign: "left" as const,
};

const footer = {
    color: "#8898aa",
    fontSize: "12px",
    lineHeight: "16px",
};
