# Beauty Star Orders

## Deploy to Vercel (the app)
1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import your GitHub repo
3. Click Deploy — thats it. Live at yourapp.vercel.app

## Run the branch server (each store PC)
1. Install Node.js from nodejs.org
2. Put orders-bs.js, orders-bs.bat, package.json in a folder
3. Open Command Prompt in that folder, run: npm install
4. Double-click orders-bs.bat — keep it running
5. In app Settings, set Server Address to http://127.0.0.1:3001/stock

## Shopify images
1. Shopify Admin > Settings > Apps > Develop Apps
2. Create app, enable Storefront API, copy the Storefront Access Token
3. In app Settings > Shopify Connection — enter your domain and token
