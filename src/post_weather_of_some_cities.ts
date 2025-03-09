import { BskyAgent } from '@atproto/api';
import OpenWeatherMap from 'openweathermap-ts';
import * as dotenv from 'dotenv';
import { exec } from "child_process";
import fs from "fs";
import util from "util";

function createUrls(cityNames: Array<string>, weatherInfo: Map<string, any>): Map<string, string> {
    // create Urls for weather icons
    var urlsOfWeatherIcons = new Map<string, string>;
    for (let city of cityNames) {
        let info: {[key: string]: any} = weatherInfo.get(city);
        let iconCode = info["weather"][0].icon;
        urlsOfWeatherIcons.set(city, "https://openweathermap.org/img/wn/" + iconCode + ".png");
    }
    console.log(urlsOfWeatherIcons);
    return urlsOfWeatherIcons;
}

function createPosts(cityNames: Array<string>, weatherInfo: Map<string, any>): string {
    // create message and post to Bluesky
    var message: string = `Today\'s weather.\n\n`;
    for (let city of cityNames) {
        let info: {[key: string]: any} = weatherInfo.get(city);
        let iconCode = info["weather"][0].icon;
        // originally, want to put an ascii text
        // let icon = fs.readFileSync(iconCode + ".txt", "utf-8");
        let icon = getWeatherEmoji(info["weather"][0].id);
        message += `Location: ${city}\nweather: ${icon}\ndescription: ${info["weather"][0].description}\n\n`;
    }
    message += "Posted this via OpenWeatherMap's WebAPI.";
    console.log(message);
    return message;
}

// promisify commands that will be executed in Future
const execPromise = util.promisify(exec);

// download images
async function downloadImages(cityNames: Array<string>, weatherInfo: Map<string, any>, urls: Map<string, string>) {
    for (let city of cityNames) {
        let info: {[key: string]: any} = weatherInfo.get(city);
        let output = basename(`${urls.get(city)}`);
        await execPromise(`curl -L -o ${output} "${urls.get(city)}"`);
    }
}

// 画像をUnicodeアートに変換
async function convertToAscii(cityNames: Array<string>, weatherInfo: Map<string, any>, urls: Map<string, string>) {
    let command = "chafa";
    try {
        await execPromise(`command -v ${command}`);
        console.log(`${command} is installed.`);
    } catch {
        console.log(`${command} is not installed`)
        await execPromise(`brew install ${command}`);
        console.log(`${command} is now installed`)
        return
    }
    for (let city of cityNames) {
        let info: {[key: string]: any} = weatherInfo.get(city);
        let input = basename(`${urls.get(city)}`);
        let output = input.replace(/.png/g, '.txt');
        //await execPromise(`${command} --format=iterm --symbols=block ${input} > ${output}`);
        await execPromise(`${command} --format=iterm  --symbols=block --colors=256 --size=20x10 ${input} > ${output}`);
    }
}

function basename(path: string): string {
    return path.replace(/\\/g, '/').substring(path.lastIndexOf('/') + 1);
}

function getWeatherEmoji(weatherId: number): string {
   // Weather condition codes from OpenWeatherMap API
   // https://openweathermap.org/weather-conditions
 
    switch (true) {
        // Clear
        case weatherId === 800:
          return "☀️";
        
        // Few clouds
        case weatherId === 801:
          return "🌤️";
        
        // Scattered clouds
        case weatherId === 802:
          return "⛅";
        
        // Broken/overcast clouds
        case weatherId === 803 || weatherId === 804:
          return "☁️";
        
        // Rain
        case (weatherId >= 300 && weatherId < 600) || 
             (weatherId >= 520 && weatherId <= 531):
            return "🌧️";
        
        // Thunderstorm
        case weatherId >= 200 && weatherId < 300:
            return "⛈️";
        
        // Snow
        case weatherId >= 600 && weatherId < 700:
            return "❄️ ";
        
        // Mist, fog, etc.
        case weatherId >= 700 && weatherId < 800:
            return "🌫️";
        
        // Default
        default:
            return "🌡️";
        }
}

//
//
async function main() {
    // get from .env
    dotenv.config();
    const openWeatherAPIKey = process.env.OPEN_WEATHER_MAP_API_KEY as string
    const password = process.env.PASSWORD as string
    // validation
    if (!openWeatherAPIKey || !password) {
        console.error('No settings of Environment Variables'); 
        process.exit(1);
    }

    try {
        //
        // get weatheres of multiple cities from OpenWeatherMap
        const openWeather = new OpenWeatherMap({
            apiKey: openWeatherAPIKey
        });
        // define the lists of cities 
        let cityNames: Array<string> = ["Tokyo","New York","London"];
        var weatherInfo = new Map<string, any>();
        for (let city of cityNames) {
            weatherInfo.set(city, await openWeather.getCurrentWeatherByCityName({
                cityName: city
            }));
        }
        console.log('Weather object is', weatherInfo.get("Tokyo"));
        let weatherWithCity: {[key: string]: any} = weatherInfo.get("Tokyo")!;
        if (!weatherWithCity) {
            throw new Error("weatherWithCity is null");
        }
        console.log(weatherWithCity);

        let iconUrls = createUrls(cityNames,weatherInfo);
        console.log(iconUrls);
        await downloadImages(cityNames,weatherInfo,iconUrls);
        await convertToAscii(cityNames,weatherInfo,iconUrls);
        let message = await createPosts(cityNames,weatherInfo);

        const agent = new BskyAgent({
            service: 'https://bsky.social'
        });

        await agent.login({
            identifier: 'clove823.bsky.social',
            password: password
        });
        console.log('logged in'); 

        await agent.post({
            text: message,
            createdAt: new Date().toISOString()
        });
        console.log('posted!'); 

    } catch (error) {
        console.log('Error occured: ', error); 
        process.exit(1);
    }

}

// execute
main().catch(console.error);

