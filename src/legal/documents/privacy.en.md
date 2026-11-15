# Privacy Policy

Version: {version}

This policy explains which personal data the Discord bot **{botName}** processes when you take part in an event (such as a build battle), act as a judge or use the dashboard, and which rights you have.

## 1. Controller

The controller under the General Data Protection Regulation (GDPR) is:

{operatorName}
{operatorAddress}
Email: {operatorEmail}

No data protection officer has been appointed, as there is no legal obligation to do so.

Events are run together with the participating communities (e.g. BTE Germany and BTE Poland). Their team and judge members see the event data listed below as far as this is needed to run and judge the event. For any request, your contact is always the controller named above.

## 2. Data we process

**Discord data**
- your Discord user ID and your user or display name
- your profile picture, only to draw your profile card; it is not stored
- the ID of the server and channel in which you use the bot
- the language setting of your Discord client, only to show the bot in your language; it is not stored

**Registration**
- your Minecraft name and your team
- when you accepted the Terms of Service, and which version
- whether you have been excluded from an event

**Submissions**
- coordinates, type and link of the reference, and optionally the built area
- your screenshots
- notes you leave for the judges
- status, scores, rejection reasons and corrections

**Judges**
- Discord ID and name, and their team or the neutral group
- the scores, rejections and corrections they give, including reasons

**Activity log**
- registrations, submissions, scores, corrections and deletions, with time, the person involved and the change in points

**Dashboard (administrators only)**
- a session cookie that is technically necessary to stay logged in (valid for 12 hours)

**Server logs**
- technical logs of the bot server with time, Discord ID, names and error messages

## 3. Purposes and legal bases

- **Running the event** (registration, submissions, judging, awarding points, notifications): Art. 6(1)(b) GDPR. You take part on the basis of the Terms of Service.
- **Publishing submissions and rankings** in the Discord channels of the participating servers, in announcements and in the event wrap-up: Art. 6(1)(b) GDPR, as the public ranking is part of the competition.
- **Public leaderboard via the web interface** (see section 5): Art. 6(1)(f) GDPR. Our legitimate interest is showing the event results, for example on websites and on the Minecraft server (/lb).
- **Activity log and server logs**: Art. 6(1)(f) GDPR. Our legitimate interest is fair, traceable judging, investigating abuse and keeping the service stable.
- **Record of the accepted Terms of Service**: Art. 6(1)(b) and (f) GDPR.
- **Dashboard session cookie**: Section 25(2) no. 2 TDDDG (technically necessary) and Art. 6(1)(f) GDPR.

We make no automated decisions within the meaning of Art. 22 GDPR. Builds are scored by people (the judges); the bot only calculates the averages.

## 4. Recipients

- **Discord Inc.** (USA): all communication with the bot runs through Discord, and Discord's privacy policy applies.
- **Members of the participating Discord servers** see your submissions, scores and rankings in the respective channels. Judge views (individual scores, notes, corrections) are only visible to people with access to the judge channel.
- **Microsoft (Azure Blob Storage)** stores your screenshots if image storage is enabled. Otherwise they stay with Discord.
- **{hostingProvider}** runs the server for the bot and its database, as our processor under Art. 28 GDPR.
- **Recipients of an optional statistics webhook** receive the public leaderboard data (section 5).

Discord and Microsoft may process data in the USA. Both are certified under the EU-US Data Privacy Framework; transfers rely on the European Commission's adequacy decision (Art. 45 GDPR).

## 5. Publicly visible data

The following data is visible to all members of the participating Discord servers, and to anyone through the public web interface ({publicUrl}/leaderboard):

- Discord ID and Minecraft name of participants with points, and their points
- for every submission: coordinates, reference link and type, screenshots, the score per category, the Discord IDs of the judges who scored it, and the time it was submitted

The following are not public: notes for the judges, rejection reasons (except on the panel of your own submission), correction reasons and the activity log.

## 6. How long we keep data

- **Event data** (registration, submissions, scores, activity log) is deleted automatically no later than {retentionMonths} months after the event ends. Screenshots in image storage are deleted at the same time.
- If judges delete a submission, its data and screenshots are removed immediately.
- **Server logs** are deleted after 30 days at the latest.
- Dashboard **login links** expire after 10 minutes, and **sessions** after 12 hours.
- Messages already sent in Discord (such as announcements) stay until they are deleted in Discord.

## 7. Do you have to provide data?

Your Minecraft name and the details of your submissions are needed to take part; without them you cannot participate. There is no legal obligation to provide them.

## 8. Your rights

You have the right to:
- access to your data (Art. 15 GDPR)
- rectification of incorrect data (Art. 16 GDPR)
- erasure (Art. 17 GDPR)
- restriction of processing (Art. 18 GDPR)
- data portability (Art. 20 GDPR)

To use these rights, email {operatorEmail} and include your Discord ID so we can find your data.

**Right to object (Art. 21 GDPR):** where we process data based on legitimate interests (Art. 6(1)(f) GDPR), you may object at any time on grounds relating to your particular situation, in particular to publication through the web interface.

You can also complain to a data protection supervisory authority, for example the one where you live. The authority responsible for us is the Bavarian Data Protection Authority (BayLDA), Promenade 18, 91522 Ansbach, Germany.

## 9. Minors

Anyone who is allowed to use Discord under Discord's terms in their country may use the bot. Processing is not based on consent but on taking part in the event. If you are under 18, please talk to your parents or guardians before taking part.

## 10. Changes

We update this policy when the bot or the law changes. You can read the current version at any time with `/legal`. If there are significant changes, the bot will tell you before your next submission.
