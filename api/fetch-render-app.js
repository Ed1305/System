// api/fetch-render-app.js
export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Missing url' });
    }

    // Extract service ID or name from the Render URL
    // Render URLs are usually: https://<service-name>.onrender.com
    let serviceName;
    try {
        const hostname = new URL(url).hostname;
        serviceName = hostname.split('.')[0]; // e.g., "my-app"
    } catch (err) {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    // Call Render API to get service details
    // Render API endpoint: GET https://api.render.com/v1/services
    // We need to search by name (or have the service ID)
    const apiKey = process.env.RENDER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Render API key not configured' });
    }

    try {
        // First, get all services (you may need to paginate if you have many)
        const response = await fetch('https://api.render.com/v1/services', {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        if (!response.ok) {
            throw new Error(`Render API error: ${response.status}`);
        }
        const services = await response.json();

        // Find the service whose 'serviceDetails' match the name
        const service = services.find(s => s.service.name === serviceName);
        if (!service) {
            return res.status(404).json({ error: 'Service not found on Render' });
        }

        // Return the information you want (name, maybe repo, etc.)
        res.status(200).json({
            name: service.service.name,
            repo: service.service.repo,
            updatedAt: service.service.updatedAt
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch from Render' });
    }
}
