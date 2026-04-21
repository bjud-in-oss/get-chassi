# Get-Chassi Setup Guide

This guide explains how to set up the **Get-Chassi** tool on your Linux machine (Chromebook) and how to manage it.

## 1. Initial Setup from Scratch

If you ever need to set this up on a new machine or from a fresh start, follow these steps:

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/bjud-in-oss/get-chassi
    cd get-chassi
    ```

2.  **Install Node.js Dependencies**:
    Run the following command to install all necessary packages (Puppeteer, Express, etc.):
    ```bash
    npm install
    ```
    *Note: If you encounter a `ReferenceError: File is not defined` error, ensure you are using `cheerio@1.0.0-rc.12` by running `npm install cheerio@1.0.0-rc.12`.*

3.  **Start the Server**:
    To launch the application, run:
    ```bash
    npm start
    ```
    The server will start on **port 3131**. You should see a message saying `🚗 Get-Chassi körs på http://localhost:3131`.

4.  **Access the Application**:
    Open your browser and navigate to:
    [http://localhost:3131](http://localhost:3131)

---

## 2. How to Turn It Off

When you are done using the tool and want to free up system resources:

1.  **Stop the Server**:
    Go to the terminal window where the server is running and press:
    `Ctrl + C`
    
    This will trigger a graceful shutdown:
    *   It closes the automated browser (Puppeteer) instance.
    *   It stops the Express web server.
    *   It releases the memory and CPU used by the process.

2.  **Verify it's off**:
    If you try to refresh `http://localhost:3131` in your browser, it should now show a "Connection Refused" error.

---

## 3. Syncing with `gs` (Chromebook)

As you mentioned using `gs` for syncing, you can ensure this documentation is always backed up by copying it to your sync directory. Any folder with the .git folder inside can be used. For example:

```bash
# Replace [SYNC_FOLDER] with your actual path
cp SETUP_GUIDE.md ~/[SYNC_FOLDER]/
```

---

## Technical Details (For Reference)
- **Port**: 3131
- **Browser**: Puppeteer (Chromium)
- **Engine**: Node.js
