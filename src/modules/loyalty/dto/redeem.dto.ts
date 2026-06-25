import { IsUUID } from 'class-validator';

export class RedeemDto {
  @IsUUID()
  rewardId!: string;
}
