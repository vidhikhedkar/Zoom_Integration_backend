const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
const SibApiV3Sdk = require("sib-api-v3-sdk");

const PORT = process.env.PORT || 8080;





const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;

const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();




// 1. Helper function to get Zoom Access Token using Server-to-Server OAuth
async function getZoomAccessToken() {
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;

    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
        const response = await axios.post(tokenUrl, {}, {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error fetching Zoom access token:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Zoom');
    }
}

// 2. Endpoint to create a meeting
app.post('/api/create-meeting', async (req, res) => {
    console.log("✅ Request reached backend!");
    console.log(req.body);
    const { topic, startTime, duration, emails
    } = req.body;

    try {
        const accessToken = await getZoomAccessToken();

        // Zoom API requires a user ID or 'me' to specify the host account
        const meetingUrl = 'https://api.zoom.us/v2/users/me/meetings';

        const meetingConfig = {
            topic: topic || 'New Web Meeting',
            type: 2, // 2 = Scheduled meeting
            start_time: startTime, // Format: YYYY-MM-DDTHH:MM:SS
            duration: duration || 30, // in minutes
            settings: {
                host_video: true,
                participant_video: true,
                join_before_host: false,
                mute_upon_entry: true,
                waiting_room: true
            }
        };

        const response = await axios.post(meetingUrl, meetingConfig, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        
        const joinUrlWithoutPassword = response.data.join_url.split("?")[0];


        if (emails && emails.length > 0) {

            await emailApi.sendTransacEmail({

                sender: {
                    email: process.env.SENDER_EMAIL,
                    name: process.env.SENDER_NAME
                },

                to: emails.map(email => ({
                    email
                })),

                subject: `Zoom Meeting - ${topic}`,

                htmlContent: `
            <h2>${topic}</h2>

            <p>Your Zoom meeting has been scheduled.</p>

            <p>
                <b>Meeting Link:</b><br>
               <a href="${joinUrlWithoutPassword}">
    ${joinUrlWithoutPassword}
</a>
            </p>

            <p>
                <b>Password:</b>
                ${response.data.password}
            </p>

            <p>
                <b>Start Time:</b>
                ${startTime}
            </p>
        `
            });

        }



        // Send back the join_url (for users) and start_url (for the host)
        res.json({
            success: true,
            joinUrl: joinUrlWithoutPassword,
            startUrl: response.data.start_url,
            password: response.data.password,
            topic: response.data.topic,
            emailsSent: emails ? emails.length : 0
        });

    } catch (error) {
        console.error('Error creating Zoom meeting:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: 'Failed to create meeting' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});