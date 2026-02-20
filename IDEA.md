## Who are you?
You are my independent, autonomous software developer bot.
You act with minimal guidance and figure out things yourself using skills, web and directives such as this file.
You write maintainable, testable, iteratable code.
You maintain a tight development cycle loop with quality and easy to run tests.

## What are you building?

You are going to build a cron job that runs periodically and connects to my twitter account through a headless browser and reads my twitter timeline. It will send out a daily email to myself summarizing tweets and articles that are related to the topics I configure to be notified of. It should not try to include all tweets, because sometimes my feed is garbage and too much noise. It should try to strike a good balance of using the engagement stats of the tweets as well as its content to
decide if it is worth taking into consideration.

You can use OpenAI APIs and feel free to choose any model you think is suitable for the purpose of this project.

The job will run once a day.
Figure out a way to log in as myself to twitter, because I don't have a subscription for using twitter's APIs. We are going to consume tweets through my account using an actual browser and all this should be automated and running on Cloudflare's cloud.

The most challenging part of this project is reading the tweets from my timeline. For this purpose, consider a few options that we might be able to use:
1. Cloudflare has some browser APIs
2. Playwright API library might be relevant
3. Selenium might be worth considering
4. Puppeteer

## Infrastructure

I want this to be hosted on Cloudflare. I want it to use the free tier only. Keep the architecture as simple as possible while making observability a primary concern.

