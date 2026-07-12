internal static class ProbeStatusBuilder
{
    public static ProbeResult Build(ProbeState state)
    {
        return new ProbeResult(GetStatus(state), state.Fields, state.Warnings, state.Diagnostics());
    }

    private static string GetStatus(ProbeState state)
    {
        if (state.GmcmFieldsCaptured > 0)
        {
            state.FailureStage = null;
            return "succeeded";
        }

        if (state.GmcmDetected
            && state.RuntimeAttempted
            && HasActionableGmcmEvidence(state))
        {
            state.FailureStage ??= "gmcm-not-captured";
            return "unavailable";
        }

        return state.Warnings.Any(warning => warning.Contains("GMCM", StringComparison.OrdinalIgnoreCase))
            ? "unavailable"
            : "not-run";
    }

    private static bool HasActionableGmcmEvidence(ProbeState state)
    {
        return state.GmcmInteractionCount > 0
            || state.RegistrationCandidates.Count > 0
            || state.StaticFieldsCaptured > 0;
    }
}
