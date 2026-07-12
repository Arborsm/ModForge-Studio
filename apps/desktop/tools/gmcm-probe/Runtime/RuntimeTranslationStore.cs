internal static class RuntimeTranslationStore
{
    public static string LoadTranslationValue(string modPath, string key)
    {
        return LoadTranslations(modPath).GetValueOrDefault(key, key);
    }

    private static Dictionary<string, string> LoadTranslations(string modPath)
    {
        Dictionary<string, string> result = new(StringComparer.OrdinalIgnoreCase);
        foreach (var fileName in (string[])["default.json", "en.json", "zh.json", "zh-CN.json"])
        {
            if (!ProbePathSafety.TryResolveRelativeFileWithinRoot(
                modPath,
                Path.Combine("i18n", fileName),
                out var path,
                out _))
            {
                continue;
            }

            try
            {
                var values = ProbeJson.Deserialize<Dictionary<string, string>>(File.ReadAllText(path));
                if (values is null)
                {
                    continue;
                }

                foreach (var (key, value) in values)
                {
                    result[key] = value;
                }
            }
            catch
            {
                // Translation files only provide display metadata for the probe.
            }
        }

        return result;
    }
}
