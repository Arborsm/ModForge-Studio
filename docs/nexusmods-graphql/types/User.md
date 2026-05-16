# User

## Description

A Nexus Mods user

## Fields

| Field Name | Description |
| --- | --- |
| `about` - [String](../types/String.md) | User's bio |
| `avatar` - [String!](../types/String.md) | The avatar for this user |
| `banned` - [Boolean!](../types/Boolean.md) | If true, this user has been banned |
| `blockedFromOptingInModsAt` - [DateTime](../types/DateTime.md) | Timestamp at which user's new mods were blocked from earning DP |
| `collectionCount` - [Int!](../types/Int.md) | Number of collections uploaded by this user. This does not include unlisted or moderated collections. |
| `contributedModCount` - [Int!](../types/Int.md) | The number of mods this user has contributed to |
| `country` - [String](../types/String.md) | ISO Country Code |
| `deleted` - [Boolean!](../types/Boolean.md) | If true, this user has been deleted |
| `donationsEnabled` - [Boolean!](../types/Boolean.md) | If true, this user has enabled donations on their profile page |
| `dpOptedIn` - [Boolean!](../types/Boolean.md) | If false, this user has specifically opted-out of the DP system. By default, all users are opted in. |
| `email` - [String!](../types/String.md) | The user's email address. Users can only access their own protected data. |
| `endorsementsGiven` - [Int!](../types/Int.md) | Number of mod endorsements given by this user |
| `fullPageNotificationCount` - [Int](../types/Int.md) | The number of full page notifications this user has been served in the past. |
| `hasGivenKudos` - [Boolean!](../types/Boolean.md) | If true, the viewer (current user) has given kudos to this user. |
| `imageCount` - [Int!](../types/Int.md) | Number of images uploaded by this user. This does not include moderated images. |
| `ipAddress` - [String](../types/String.md) | The user's last known IP Address. Users can only access their own protected data. |
| `isBlocked` - [Boolean!](../types/Boolean.md) | If true, the viewer (current user) has blocked this user. |
| `isTracked` - [Boolean!](../types/Boolean.md) | If true, the viewer (current user) is tracking this user. |
| `joined` - [DateTime!](../types/DateTime.md) | Date the user joined |
| `kudos` - [Int!](../types/Int.md) | The number of 'kudos' given to this user |
| `lastActive` - [DateTime](../types/DateTime.md) | Date the user was last active |
| `legacyRoles` - [[String!]!](../types/String.md) | Legacy roles for this user. Returns an array of roles. E.g. "[SiteProgrammer, QA Tester]" |
| `memberId` - [Int!](../types/Int.md) | The database ID for this user. |
| `membershipRoles` - [[String!]!](../types/String.md) | Membership status for this user. Returns an array of roles. E.g. all users are "member" |
| `modAnalyticsByMonth` - [ModAnalyticsByMonthPage!](../types/ModAnalyticsByMonthPage.md) | The analytics for the user's mods, grouped by month |
| Arguments `affiliation` - [ModAffiliation](../types/ModAffiliation.md) The affiliation to filter by `page` - [Int](../types/Int.md) The page number to retrieve `pageSize` - [Int](../types/Int.md) The number of results per page `sortBy` - [ModAnalyticsByMonthSortBy](../types/ModAnalyticsByMonthSortBy.md) The field to sort by `sortDirection` - [SortDirection](../types/SortDirection.md) The direction to sort by |  |
| `modAnalyticsForMonth` - [ModAnalyticsForMonthPage!](../types/ModAnalyticsForMonthPage.md) | The analytics for the user's mods for a specific month |
| Arguments `year` - [Int!](../types/Int.md) The year to retrieve analytics for `month` - [Int!](../types/Int.md) The month to retrieve analytics for `query` - [String](../types/String.md) Search term to filter mods by `affiliation` - [ModAffiliation](../types/ModAffiliation.md) The affiliation to filter by `page` - [Int](../types/Int.md) The page number to retrieve `pageSize` - [Int](../types/Int.md) The number of results per page `sortBy` - [ModAnalyticsForMonthSortBy](../types/ModAnalyticsForMonthSortBy.md) The field to sort by `sortDirection` - [SortDirection](../types/SortDirection.md) The direction to sort by |  |
| `modCount` - [Int!](../types/Int.md) | Number of mods uploaded by this user. This does not include hidden, moderated or unpublished mods. |
| `moderationHistoryCount` - [Int](../types/Int.md) | The number of moderation warnings this user has been served in the past. |
| `moderationJwt` - [String!](../types/String.md) | JWT token for submitting moderation reports |
| `modsBlockedFromEarningDp` - [BlockedModsPage!](../types/BlockedModsPage.md) | A list of mods blocked from earning dp |
| Arguments `count` - [Int](../types/Int.md) Number of mods to return `offset` - [Int](../types/Int.md) Number of mods to skip |  |
| `name` - [String!](../types/String.md) | The user's username. |
| `ownedModCount` - [Int!](../types/Int.md) | The number of mods this user has uploaded |
| `paypal` - [String](../types/String.md) | Email address used for PayPal donations. Users can only access their own protected data. |
| `posts` - [Int!](../types/Int.md) | The number of forum posts by this user |
| `recognizedAuthor` - [Boolean!](../types/Boolean.md) | If true, this user is a recognised mod author |
| `roles` - [[String!]!](../types/String.md) | Roles for this user. Returns an array of roles. E.g. "[Admin, Moderator]" |
| `showActivityFeed` - [Boolean!](../types/Boolean.md) | If true, this user has opted to show their activity feed on their user profile page |
| `showLastActive` - [Boolean!](../types/Boolean.md) | If true, this user has opted to show the date they were last active on their user profile page |
| `uniqueModDownloads` - [Int!](../types/Int.md) | Number of unique mod downloads on this users mods |
| `usernameLastChangedAt` - [DateTime](../types/DateTime.md) | Date the user last changed their username. Only users can access their own protected data. |
| `videoCount` - [Int!](../types/Int.md) | Number of videos uploaded by this user. This does not include moderated videos. |
| `viewerHasBlocked` - [Boolean](../types/Boolean.md) | Whether the viewer has blocked the content owner. |
| `viewerHasIgnored` - [Boolean!](../types/Boolean.md) | Whether the viewer has ignored the content owner. |
| `views` - [Int!](../types/Int.md) | Number of profile views |

## Example

```json
{
  "about": "abc123",
  "avatar": "xyz789",
  "banned": true,
  "blockedFromOptingInModsAt": "2007-12-03T10:15:30Z",
  "collectionCount": 987,
  "contributedModCount": 123,
  "country": "xyz789",
  "deleted": true,
  "donationsEnabled": false,
  "dpOptedIn": false,
  "email": "abc123",
  "endorsementsGiven": 987,
  "fullPageNotificationCount": 123,
  "hasGivenKudos": true,
  "imageCount": 987,
  "ipAddress": "abc123",
  "isBlocked": false,
  "isTracked": true,
  "joined": "2007-12-03T10:15:30Z",
  "kudos": 987,
  "lastActive": "2007-12-03T10:15:30Z",
  "legacyRoles": ["xyz789"],
  "memberId": 123,
  "membershipRoles": ["xyz789"],
  "modAnalyticsByMonth": ModAnalyticsByMonthPage,
  "modAnalyticsForMonth": ModAnalyticsForMonthPage,
  "modCount": 123,
  "moderationHistoryCount": 123,
  "moderationJwt": "xyz789",
  "modsBlockedFromEarningDp": BlockedModsPage,
  "name": "abc123",
  "ownedModCount": 987,
  "paypal": "xyz789",
  "posts": 987,
  "recognizedAuthor": false,
  "roles": ["abc123"],
  "showActivityFeed": false,
  "showLastActive": true,
  "uniqueModDownloads": 987,
  "usernameLastChangedAt": "2007-12-03T10:15:30Z",
  "videoCount": 987,
  "viewerHasBlocked": false,
  "viewerHasIgnored": true,
  "views": 987
}
```
