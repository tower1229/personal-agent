import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field, useAsyncData } from "./resource-common";
import { loadProfile, updateProfile } from "@/lib/api";
import { formatLocalYMD, parseLocalYMD } from "@/lib/format";

export function ProfilePage() {
  const profileData = useAsyncData(() => loadProfile(), []);
  
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [birthday, setBirthday] = useState("");
  const [mbti, setMbti] = useState("");
  const [enneagram, setEnneagram] = useState("");
  const [astrologySign, setAstrologySign] = useState("");
  const [soul, setSoul] = useState("");
  const [coreMemory, setCoreMemory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profileData.data) {
      setName(profileData.data.name || "");
      setGender(profileData.data.gender || "");
      setCoreMemory(profileData.data.coreMemory || "");
      if (profileData.data.birthdayTimestamp) {
        setBirthday(formatLocalYMD(profileData.data.birthdayTimestamp));
      }
      if (profileData.data.interpretationFramework) {
        try {
          const fw = JSON.parse(profileData.data.interpretationFramework);
          setMbti(fw?.mbti || "");
          setEnneagram(fw?.enneagram || "");
          setAstrologySign(fw?.astrologySign || "");
        } catch (e) {
          // ignore parsing error
        }
      }
      if (profileData.data.preferences) {
        try {
          const pref = JSON.parse(profileData.data.preferences);
          setSoul(pref?.soul || "");
        } catch (e) {
          // ignore parsing error
        }
      }
    }
  }, [profileData.data]);

  async function handleSave() {
    setSaving(true);
    try {
      const birthdayTimestamp = birthday ? parseLocalYMD(birthday) : null;
      
      const interpretationFramework = JSON.stringify({
        mbti,
        enneagram,
        astrologySign
      });

      const preferences = JSON.stringify({
        soul
      });

      const updated = await updateProfile({
        name,
        gender: gender || null,
        birthdayTimestamp,
        interpretationFramework,
        preferences,
        coreMemory: coreMemory || null
      });
      toast.success("Profile updated successfully");
      profileData.setData(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  if (profileData.loading) return <div>Loading profile...</div>;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            This information helps the agent understand your life stage and background.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How the agent should address you"
              />
            </Field>
            <Field label="Gender">
              <Input
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                placeholder="e.g. Male, Female"
              />
            </Field>
            <Field label="Birthday">
              <Input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Interpretation Framework</CardTitle>
          <CardDescription>
            Core personality frameworks to help the agent understand your traits.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="MBTI">
              <Input
                value={mbti}
                onChange={(e) => setMbti(e.target.value)}
                placeholder="e.g. INTJ, ENFP"
              />
            </Field>
            <Field label="Enneagram (九型人格)">
              <Input
                value={enneagram}
                onChange={(e) => setEnneagram(e.target.value)}
                placeholder="e.g. Type 5w4"
              />
            </Field>
            <Field label="Astrology Sign (星座)">
              <Input
                value={astrologySign}
                onChange={(e) => setAstrologySign(e.target.value)}
                placeholder="e.g. Scorpio"
              />
            </Field>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>SOUL Configuration</CardTitle>
          <CardDescription>
            The core personality contract, communication style, and behavioral boundaries of the Agent (Markdown format).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            placeholder="Write SOUL configuration in markdown..."
            className="font-mono min-h-[300px]"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Core Memory</CardTitle>
          <CardDescription>
            High-priority core memory (in Markdown format). 
            This information is always injected into the LLM context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={coreMemory}
            onChange={(e) => setCoreMemory(e.target.value)}
            placeholder="Write core memory in markdown..."
            className="font-mono min-h-[300px]"
          />
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </div>
    </div>
  );
}
