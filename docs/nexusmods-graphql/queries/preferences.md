# preferences

## Description

Get a list of user preferences for the current user

## Response

Returns a [Preference](../types/Preference.md)

#### Example

## Query

```gql
query preferences {
  preferences {
    adult
    adultBlurImages
    bubbleReply
    comments
    defaultMediaTab
    defaultMediaTabTimeRange
    defaultModsTab
    defaultModsTabTimeRange
    defaultOrder
    defaultSearchType
    defaultSearchView
    disableProfileActivity
    displayLastActivity
    dlLocation
    download
    id
    imageShowcase
    isBlockingContent
    marketingEmails
    notificationsActive
    notificationsGameSpecific
    reminder
    results
    subfeedsActivityTracked
    subfeedsActivityYour
    subfeedsAuthorTracked
    subfeedsCommentsTracked
    subfeedsCommentsYour
  }
}
```

## Response

```json
{
  "data": {
    "preferences": {
      "adult": false,
      "adultBlurImages": true,
      "bubbleReply": false,
      "comments": "COMMENTS_10",
      "defaultMediaTab": "NEW",
      "defaultMediaTabTimeRange": "ALL_TIME",
      "defaultModsTab": "NEW",
      "defaultModsTabTimeRange": "ALL_TIME",
      "defaultOrder": "BY_RECENT_FILES",
      "defaultSearchType": "ALL_CONTENT",
      "defaultSearchView": "STANDARD",
      "disableProfileActivity": true,
      "displayLastActivity": true,
      "dlLocation": "NEXUS_CDN",
      "download": "POP_UP_BOX",
      "id": "4",
      "imageShowcase": "NOT_SET",
      "isBlockingContent": true,
      "marketingEmails": false,
      "notificationsActive": false,
      "notificationsGameSpecific": true,
      "reminder": "NEVER",
      "results": "RESULTS_20",
      "subfeedsActivityTracked": true,
      "subfeedsActivityYour": true,
      "subfeedsAuthorTracked": true,
      "subfeedsCommentsTracked": true,
      "subfeedsCommentsYour": false
    }
  }
}
```
