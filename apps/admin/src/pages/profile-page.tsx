import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, useAsyncData } from "./resource-common";
import { loadProfile, updateProfile } from "@/lib/api";
import { formatLocalYMD, parseLocalYMD } from "@/lib/format";

export function ProfilePage() {
  const profileData = useAsyncData(() => loadProfile(), []);
  
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [birthday, setBirthday] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profileData.data) {
      setName(profileData.data.name || "");
      setGender(profileData.data.gender || "");
      if (profileData.data.birthdayTimestamp) {
        setBirthday(formatLocalYMD(profileData.data.birthdayTimestamp));
      }
    }
  }, [profileData.data]);

  async function handleSave() {
    setSaving(true);
    try {
      const birthdayTimestamp = birthday ? parseLocalYMD(birthday) : null;
      const updated = await updateProfile({
        name,
        gender: gender || null,
        birthdayTimestamp
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
          <div className="flex justify-end">
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
