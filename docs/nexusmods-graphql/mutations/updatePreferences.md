# updatePreferences

## Description

Updates a users preferences

## Response

Returns a [LegacyUpdatePreferencesMutationPayload](../types/LegacyUpdatePreferencesMutationPayload.md)

## Arguments

| Name | Description |
| --- | --- |
| `defaultModsTab` - [PreferencesDefaultModsTabEnum](../types/PreferencesDefaultModsTabEnum.md) | Default mods tab |
| `defaultModsTabTimeRange` - [PreferencesTimeRangeEnum](../types/PreferencesTimeRangeEnum.md) | Default mods tab time range |
| `defaultMediaTab` - [PreferencesDefaultMediaTabEnum](../types/PreferencesDefaultMediaTabEnum.md) | Default media tab |
| `defaultMediaTabTimeRange` - [PreferencesTimeRangeEnum](../types/PreferencesTimeRangeEnum.md) | Default media tab time range |
| `subfeedsCommentsYour` - [Boolean](../types/Boolean.md) | Comments about a users files, images and videos |
| `subfeedsActivityYour` - [Boolean](../types/Boolean.md) | Activity about a users files, images and videos |
| `subfeedsCommentsTracked` - [Boolean](../types/Boolean.md) | Comments about tracked files, images and videos |
| `subfeedsActivityTracked` - [Boolean](../types/Boolean.md) | Activity about tracked files, images and videos |
| `subfeedsAuthorTracked` - [Boolean](../types/Boolean.md) | Author tracked files, images and videos |
| `defaultOrder` - [PreferencesDefaultSortEnum](../types/PreferencesDefaultSortEnum.md) | Default sorting option |
| `defaultSearchView` - [PreferencesDefaultSearchViewEnum](../types/PreferencesDefaultSearchViewEnum.md) | Default search view |
| `results` - [PreferencesResultsEnum](../types/PreferencesResultsEnum.md) | Number of items to show per page |
| `comments` - [PreferencesCommentsEnum](../types/PreferencesCommentsEnum.md) | Number of comments to show per page |
| `dlLocation` - [PreferencesDlLocationEnum](../types/PreferencesDlLocationEnum.md) | Preferred download location |
| `reminder` - [PreferencesReminderEnum](../types/PreferencesReminderEnum.md) | User reminder for file ratings |
| `imageShowcase` - [PreferencesImageShowcaseEnum](../types/PreferencesImageShowcaseEnum.md) | Images added by author in image description |
| `bubbleReply` - [Boolean](../types/Boolean.md) | Replies to posts bump original post |
| `disableProfileActivity` - [Boolean](../types/Boolean.md) | Display user activity |
| `displayLastActivity` - [Boolean](../types/Boolean.md) | Display when user was last active |
| `adult` - [Boolean](../types/Boolean.md) | Show adult content |
| `adultBlurImages` - [Boolean](../types/Boolean.md) | Blur adult images |
| `download` - [PreferencesDownloadMethodEnum](../types/PreferencesDownloadMethodEnum.md) | Preferred download method |
| `notificationsActive` - [Boolean](../types/Boolean.md) | Display notifications |
| `notificationsGameSpecific` - [Boolean](../types/Boolean.md) | Display game specific notifications when on game pages |
| `defaultSearchType` - [PreferencesSearchTypeEnum](../types/PreferencesSearchTypeEnum.md) | Default search type |
| `marketingEmails` - [Boolean](../types/Boolean.md) | Receive marketing emails |

#### Example

## Query

```gql
mutation updatePreferences(
  $defaultModsTab: PreferencesDefaultModsTabEnum,
  $defaultModsTabTimeRange: PreferencesTimeRangeEnum,
  $defaultMediaTab: PreferencesDefaultMediaTabEnum,
  $defaultMediaTabTimeRange: PreferencesTimeRangeEnum,
  $subfeedsCommentsYour: Boolean,
  $subfeedsActivityYour: Boolean,
  $subfeedsCommentsTracked: Boolean,
  $subfeedsActivityTracked: Boolean,
  $subfeedsAuthorTracked: Boolean,
  $defaultOrder: PreferencesDefaultSortEnum,
  $defaultSearchView: PreferencesDefaultSearchViewEnum,
  $results: PreferencesResultsEnum,
  $comments: PreferencesCommentsEnum,
  $dlLocation: PreferencesDlLocationEnum,
  $reminder: PreferencesReminderEnum,
  $imageShowcase: PreferencesImageShowcaseEnum,
  $bubbleReply: Boolean,
  $disableProfileActivity: Boolean,
  $displayLastActivity: Boolean,
  $adult: Boolean,
  $adultBlurImages: Boolean,
  $download: PreferencesDownloadMethodEnum,
  $notificationsActive: Boolean,
  $notificationsGameSpecific: Boolean,
  $defaultSearchType: PreferencesSearchTypeEnum,
  $marketingEmails: Boolean
) {
  updatePreferences(
    defaultModsTab: $defaultModsTab,
    defaultModsTabTimeRange: $defaultModsTabTimeRange,
    defaultMediaTab: $defaultMediaTab,
    defaultMediaTabTimeRange: $defaultMediaTabTimeRange,
    subfeedsCommentsYour: $subfeedsCommentsYour,
    subfeedsActivityYour: $subfeedsActivityYour,
    subfeedsCommentsTracked: $subfeedsCommentsTracked,
    subfeedsActivityTracked: $subfeedsActivityTracked,
    subfeedsAuthorTracked: $subfeedsAuthorTracked,
    defaultOrder: $defaultOrder,
    defaultSearchView: $defaultSearchView,
    results: $results,
    comments: $comments,
    dlLocation: $dlLocation,
    reminder: $reminder,
    imageShowcase: $imageShowcase,
    bubbleReply: $bubbleReply,
    disableProfileActivity: $disableProfileActivity,
    displayLastActivity: $displayLastActivity,
    adult: $adult,
    adultBlurImages: $adultBlurImages,
    download: $download,
    notificationsActive: $notificationsActive,
    notificationsGameSpecific: $notificationsGameSpecific,
    defaultSearchType: $defaultSearchType,
    marketingEmails: $marketingEmails
  ) {
    success
  }
}
```

## Variables

```json
{
  "defaultModsTab": "NEW",
  "defaultModsTabTimeRange": "ALL_TIME",
  "defaultMediaTab": "NEW",
  "defaultMediaTabTimeRange": "ALL_TIME",
  "subfeedsCommentsYour": false,
  "subfeedsActivityYour": true,
  "subfeedsCommentsTracked": true,
  "subfeedsActivityTracked": false,
  "subfeedsAuthorTracked": true,
  "defaultOrder": "BY_RECENT_FILES",
  "defaultSearchView": "STANDARD",
  "results": "RESULTS_20",
  "comments": "COMMENTS_10",
  "dlLocation": "NEXUS_CDN",
  "reminder": "NEVER",
  "imageShowcase": "NOT_SET",
  "bubbleReply": true,
  "disableProfileActivity": true,
  "displayLastActivity": false,
  "adult": false,
  "adultBlurImages": true,
  "download": "POP_UP_BOX",
  "notificationsActive": true,
  "notificationsGameSpecific": true,
  "defaultSearchType": "ALL_CONTENT",
  "marketingEmails": true
}
```

## Response

```json
{"data": {"updatePreferences": {"success": true}}}
```
