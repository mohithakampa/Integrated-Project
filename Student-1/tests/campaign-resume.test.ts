import { describe, expect, it } from 'vitest'
import { campaignResumeScreen } from '../src/game2d/rules'
import { freshCampaign } from '../src/game2d/save'

describe('saved campaign resume screens', () => {
  it('resumes active, incomplete gameplay normally', () => {
    const campaign = freshCampaign()
    expect(campaignResumeScreen(campaign)).toBe('playing')

    campaign.currentLevel = 2
    campaign.progress[2].submitted = true
    campaign.progress[2].cureCreated = true
    expect(campaignResumeScreen(campaign)).toBe('playing')
  })

  it('returns to the Level 1 evolution-complete panel without repeating the upgrade', () => {
    const campaign = freshCampaign()
    campaign.completedLevels = [1]
    campaign.evolutionApplied = true
    expect(campaignResumeScreen(campaign)).toBe('mission-complete')
  })

  it('returns to the Level 2 cure-complete panel after submission', () => {
    const campaign = freshCampaign()
    campaign.currentLevel = 2
    campaign.completedLevels = [1, 2]
    campaign.progress[2].submitted = true
    campaign.progress[2].cureCreated = true
    expect(campaignResumeScreen(campaign)).toBe('mission-complete')
  })

  it('returns to the Level 3 research-complete panel after terminal activation', () => {
    const campaign = freshCampaign()
    campaign.currentLevel = 3
    campaign.completedLevels = [1, 2, 3]
    campaign.progress[3].terminalIds = ['hospital-research']
    expect(campaignResumeScreen(campaign)).toBe('mission-complete')
  })

  it('restores the campaign ending only after Level 4 neutralization', () => {
    const campaign = freshCampaign()
    campaign.currentLevel = 4
    campaign.completedLevels = [1, 2, 3, 4]
    expect(campaignResumeScreen(campaign)).toBe('playing')

    campaign.progress[4].neutralized = true
    expect(campaignResumeScreen(campaign)).toBe('campaign-complete')
  })
})
