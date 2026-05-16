# userByName

## Description

Get user by username

## Response

Returns a [User](../types/User.md)

## Arguments

| Name | Description |
| --- | --- |
| `name` - [String!](../types/String.md) | Username of user to find |

#### Example

## Query

```gql
query userByName($name: String!) {
  userByName(name: $name) {
    about
    avatar
    banned
    blockedFromOptingInModsAt
    collectionCount
    contributedModCount
    country
    deleted
    donationsEnabled
    dpOptedIn
    email
    endorsementsGiven
    fullPageNotificationCount
    hasGivenKudos
    imageCount
    ipAddress
    isBlocked
    isTracked
    joined
    kudos
    lastActive
    legacyRoles
    memberId
    membershipRoles
    modAnalyticsByMonth {
      ...ModAnalyticsByMonthPageFragment
    }
    modAnalyticsForMonth {
      ...ModAnalyticsForMonthPageFragment
    }
    modCount
    moderationHistoryCount
    moderationJwt
    modsBlockedFromEarningDp {
      ...BlockedModsPageFragment
    }
    name
    ownedModCount
    paypal
    posts
    recognizedAuthor
    roles
    showActivityFeed
    showLastActive
    uniqueModDownloads
    usernameLastChangedAt
    videoCount
    viewerHasBlocked
    viewerHasIgnored
    views
  }
}
```

## Variables

```json
{"name": "xyz789"}
```

## Response

```json
{
  "data": {
    "userByName": {
      "about": "abc123",
      "avatar": "xyz789",
      "banned": false,
      "blockedFromOptingInModsAt": "2007-12-03T10:15:30Z",
      "collectionCount": 123,
      "contributedModCount": 123,
      "country": "xyz789",
      "deleted": false,
      "donationsEnabled": true,
      "dpOptedIn": false,
      "email": "abc123",
      "endorsementsGiven": 987,
      "fullPageNotificationCount": 123,
      "hasGivenKudos": false,
      "imageCount": 987,
      "ipAddress": "xyz789",
      "isBlocked": true,
      "isTracked": false,
      "joined": "2007-12-03T10:15:30Z",
      "kudos": 987,
      "lastActive": "2007-12-03T10:15:30Z",
      "legacyRoles": ["abc123"],
      "memberId": 123,
      "membershipRoles": ["xyz789"],
      "modAnalyticsByMonth": ModAnalyticsByMonthPage,
      "modAnalyticsForMonth": ModAnalyticsForMonthPage,
      "modCount": 123,
      "moderationHistoryCount": 123,
      "moderationJwt": "abc123",
      "modsBlockedFromEarningDp": BlockedModsPage,
      "name": "abc123",
      "ownedModCount": 987,
      "paypal": "xyz789",
      "posts": 123,
      "recognizedAuthor": true,
      "roles": ["xyz789"],
      "showActivityFeed": false,
      "showLastActive": true,
      "uniqueModDownloads": 123,
      "usernameLastChangedAt": "2007-12-03T10:15:30Z",
      "videoCount": 123,
      "viewerHasBlocked": false,
      "viewerHasIgnored": true,
      "views": 987
    }
  }
}
```
